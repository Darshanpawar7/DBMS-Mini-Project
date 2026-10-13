import { hashPassword } from "@/lib/auth/password";
import { startSession } from "@/lib/auth/current-user";
import { ok, readJson, route } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createStudent } from "@/lib/repos/students";
import { registerSchema } from "@/lib/validation";

const HOUR = 60 * 60 * 1000;

// Self-registration always creates a 'student'; only an admin can grant 'admin'.
export const POST = route(async (request) => {
  // per address behind a trusted proxy; otherwise one shared budget for the whole server
  const ip = clientIp(request);
  rateLimit(`register:${ip ?? "all"}`, ip ? 10 : 100, HOUR);
  const input = registerSchema.parse(await readJson(request));
  const user = await createStudent({
    full_name: input.full_name,
    email: input.email,
    password_hash: await hashPassword(input.password),
    program: input.program,
    year_of_study: input.year_of_study,
  });
  await startSession(user);
  return ok({ user: { student_id: user.student_id, full_name: user.full_name, role: user.role } }, 201);
});
