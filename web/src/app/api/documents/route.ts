import { requireApiUser } from "@/lib/auth/current-user";
import { assertCanUseCourse } from "@/lib/repos/courses";
import { deleteUpload, detectFileType, extractText, MAX_UPLOAD_BYTES, saveUpload, type StoredFileType } from "@/lib/files";
import { ApiError, ok, route } from "@/lib/http";
import { createDocument, listDocuments } from "@/lib/repos/documents";
import { embedDocument, markEmbeddingFailed } from "@/lib/repos/embedding-jobs";
import { documentListSchema, documentMetaSchema, splitTags } from "@/lib/validation";

// GET /api/documents?q=&course=&tag=&scope=all|mine|bookmarked&sort=recent|popular|title&page=1
export const GET = route(async (request) => {
  const user = await requireApiUser();
  const filters = documentListSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  return ok(await listDocuments(user.student_id, filters));
});

function field(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
}

async function readContent(form: FormData): Promise<{ bytes: Uint8Array; type: StoredFileType; content: string }> {
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, "Files must be 5 MB or smaller", { file: "Too large" });
    const type = detectFileType(file.name);
    const bytes = new Uint8Array(await file.arrayBuffer());
    return { bytes, type, content: await extractText(bytes, type) };
  }
  const pasted = field(form, "text")?.trim();
  if (pasted) {
    const bytes = new TextEncoder().encode(pasted);
    if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new ApiError(413, "Text is too long", { text: "Too long" });
    return { bytes, type: "md", content: await extractText(bytes, "md") };
  }
  throw new ApiError(400, "Attach a file or paste some text", { file: "Required" });
}

// POST /api/documents  (multipart/form-data: title, description, visibility, course_id, tags, file | text)
export const POST = route(async (request) => {
  const user = await requireApiUser();
  const form = await request.formData();
  const meta = documentMetaSchema.parse({
    title: field(form, "title"),
    description: field(form, "description"),
    visibility: field(form, "visibility"),
    course_id: field(form, "course_id"),
    tags: splitTags(field(form, "tags")),
  });

  await assertCanUseCourse(user, meta.course_id);

  const { bytes, type, content } = await readContent(form);
  const storedName = await saveUpload(bytes, type);

  let docId: number;
  try {
    docId = await createDocument(user.student_id, {
      ...meta,
      file_path: storedName,
      file_type: type,
      file_size_bytes: bytes.byteLength,
      content,
    });
  } catch (error) {
    await deleteUpload(storedName); // the transaction rolled back -- remove the orphan file too
    throw error;
  }

  // Embed straight away so the note is searchable by meaning immediately.
  // If the model is unavailable the note still exists (keyword search works)
  // and an admin can re-run the embedding job later.
  let embedded = true;
  try {
    await embedDocument(docId);
  } catch (error) {
    console.error(`[upload] embedding failed for document ${docId}`, error);
    await markEmbeddingFailed(docId);
    embedded = false;
  }
  return ok({ doc_id: docId, embedded }, 201);
});
