import type { PoolClient } from "pg";
import { query, queryOne, withTransaction } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import type { DocumentCard, GroupMemberRow, GroupRecommendation, GroupRow, PartnerRecommendation } from "@/lib/types";

export interface GroupListRow extends GroupRow {
  my_role: "admin" | "member" | null;
}

/** Groups in the student's courses plus any group they belong to (admins see all). */
export function listGroupsForStudent(studentId: number, isAdmin: boolean): Promise<GroupListRow[]> {
  return query<GroupListRow>(
    `SELECT g.*, m.role AS my_role
     FROM v_group_overview g
     LEFT JOIN GROUP_MEMBERSHIP m ON m.group_id = g.group_id AND m.student_id = $1
     WHERE $2::BOOLEAN
        OR m.student_id IS NOT NULL
        OR g.course_id IN (SELECT e.course_id FROM ENROLLMENT e WHERE e.student_id = $1)
     ORDER BY (m.student_id IS NOT NULL) DESC, g.course_code, g.group_name`,
    [studentId, isAdmin],
  );
}

export interface GroupDetail extends GroupListRow {
  creator_name: string | null;
  is_enrolled: boolean;
}

export function getGroup(groupId: number, viewerId: number): Promise<GroupDetail | null> {
  return queryOne<GroupDetail>(
    `SELECT g.*, m.role AS my_role, s.full_name AS creator_name,
            EXISTS (SELECT 1 FROM ENROLLMENT e WHERE e.student_id = $2 AND e.course_id = g.course_id) AS is_enrolled
     FROM v_group_overview g
     LEFT JOIN GROUP_MEMBERSHIP m ON m.group_id = g.group_id AND m.student_id = $2
     LEFT JOIN STUDENT s ON s.student_id = g.created_by
     WHERE g.group_id = $1`,
    [groupId, viewerId],
  );
}

/** Members, students enrolled in the group's course, and platform admins may open a group. */
export function canViewGroup(group: GroupDetail, isPlatformAdmin: boolean): boolean {
  return isPlatformAdmin || group.my_role !== null || group.is_enrolled;
}

export function listMembers(groupId: number): Promise<GroupMemberRow[]> {
  return query<GroupMemberRow>(
    `SELECT s.student_id, s.full_name, s.program, m.role, m.joined_at
     FROM GROUP_MEMBERSHIP m JOIN STUDENT s ON s.student_id = m.student_id
     WHERE m.group_id = $1
     ORDER BY m.role, m.joined_at`,
    [groupId],
  );
}

/** Notes written by the group's members for the group's course, limited to what the viewer may see. */
export function groupLibrary(groupId: number, viewerId: number): Promise<DocumentCard[]> {
  return query<DocumentCard>(
    `SELECT c.*
     FROM v_document_catalog c
     JOIN STUDY_GROUP g ON g.course_id = c.course_id
     JOIN GROUP_MEMBERSHIP m ON m.group_id = g.group_id AND m.student_id = c.owner_id
     JOIN fn_visible_doc_ids($2) v ON v.doc_id = c.doc_id
     WHERE g.group_id = $1
     ORDER BY c.upload_date DESC
     LIMIT 12`,
    [groupId, viewerId],
  );
}

async function myGroupRole(groupId: number, studentId: number): Promise<"admin" | "member" | null> {
  const row = await queryOne<{ role: "admin" | "member" }>(
    "SELECT role FROM GROUP_MEMBERSHIP WHERE group_id = $1 AND student_id = $2",
    [groupId, studentId],
  );
  return row?.role ?? null;
}

/** Group admins manage their group; platform admins can manage any group. */
export async function assertGroupManager(groupId: number, actorId: number, isPlatformAdmin: boolean): Promise<void> {
  if (isPlatformAdmin) return;
  if ((await myGroupRole(groupId, actorId)) !== "admin") {
    throw new ApiError(403, "Only a group admin can do that");
  }
}

export interface GroupInput {
  group_name: string;
  description: string | null;
  max_members: number;
}

/** The creator becomes admin through trigger T6 (which also checks they are enrolled). */
export async function createGroup(actorId: number, input: GroupInput & { course_id: number }): Promise<number> {
  return withTransaction(
    async (client) => {
      const { rows } = await client.query<{ group_id: number }>(
        `INSERT INTO STUDY_GROUP (group_name, description, max_members, course_id, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING group_id`,
        [input.group_name, input.description, input.max_members, input.course_id, actorId],
      );
      return rows[0].group_id;
    },
    { actorId },
  );
}

export async function updateGroup(actorId: number, groupId: number, input: GroupInput): Promise<void> {
  await withTransaction(
    async (client) => {
      const result = await client.query(
        "UPDATE STUDY_GROUP SET group_name = $2, description = $3, max_members = $4 WHERE group_id = $1",
        [groupId, input.group_name, input.description, input.max_members],
      );
      if (result.rowCount === 0) throw new ApiError(404, "Group not found");
    },
    { actorId },
  );
}

export async function deleteGroup(actorId: number, groupId: number): Promise<void> {
  await withTransaction(
    async (client) => {
      const result = await client.query("DELETE FROM STUDY_GROUP WHERE group_id = $1", [groupId]);
      if (result.rowCount === 0) throw new ApiError(404, "Group not found");
    },
    { actorId },
  );
}

/** CALL the stored procedure: it locks the group row so the seat count cannot race. */
export async function joinGroup(studentId: number, groupId: number): Promise<void> {
  await withTransaction((client) => client.query("CALL sp_join_group($1, $2)", [studentId, groupId]), { actorId: studentId });
}

/** CALL sp_leave_group: locks the group row, then T7 hands over admin or deletes an empty group. */
export async function leaveGroup(studentId: number, groupId: number): Promise<{ groupStillExists: boolean }> {
  return withTransaction(
    async (client) => {
      await client.query("CALL sp_leave_group($1, $2)", [studentId, groupId]);
      const still = await client.query("SELECT 1 FROM STUDY_GROUP WHERE group_id = $1", [groupId]);
      return { groupStillExists: (still.rowCount ?? 0) > 0 };
    },
    { actorId: studentId },
  );
}

/** Serialise every membership change in a group on its row lock (as sp_join_group/sp_leave_group do). */
async function lockGroup(client: PoolClient, groupId: number): Promise<void> {
  const { rowCount } = await client.query("SELECT 1 FROM STUDY_GROUP WHERE group_id = $1 FOR UPDATE", [groupId]);
  if (!rowCount) throw new ApiError(404, "Group not found");
}

export async function setMemberRole(actorId: number, groupId: number, studentId: number, role: "admin" | "member"): Promise<void> {
  await withTransaction(
    async (client) => {
      await lockGroup(client, groupId);
      const result = await client.query(
        "UPDATE GROUP_MEMBERSHIP SET role = $3 WHERE group_id = $1 AND student_id = $2",
        [groupId, studentId, role],
      );
      if (result.rowCount === 0) throw new ApiError(404, "Member not found");
    },
    { actorId },
  );
}

export async function removeMember(actorId: number, groupId: number, studentId: number): Promise<void> {
  await withTransaction(
    async (client) => {
      await lockGroup(client, groupId);
      const result = await client.query("DELETE FROM GROUP_MEMBERSHIP WHERE group_id = $1 AND student_id = $2", [groupId, studentId]);
      if (result.rowCount === 0) throw new ApiError(404, "Member not found");
    },
    { actorId },
  );
}

export function recommendGroups(studentId: number, limit = 4): Promise<GroupRecommendation[]> {
  return query<GroupRecommendation>("SELECT * FROM fn_recommend_groups($1, $2)", [studentId, limit]);
}

export function recommendPartners(studentId: number, limit = 4): Promise<PartnerRecommendation[]> {
  return query<PartnerRecommendation>("SELECT * FROM fn_recommend_partners($1, $2)", [studentId, limit]);
}
