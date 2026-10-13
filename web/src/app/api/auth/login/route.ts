import { verifyPassword } from "@/lib/auth/password";
import { startSession } from "@/lib/auth/current-user";
import { ApiError, ok, readJson, route } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { findStudentForLogin, recordLogin } from "@/lib/repos/students";
import { loginSchema } from "@/lib/validation";

const FIFTEEN_MINUTES = 15 * 60 * 1000;
// Compared against when the email is unknown, so both paths cost one bcrypt check
// and response timing does not reveal which emails are registered.
const DUMMY_HASH = "$2b$10$hJlRbSMDhFbjDD1F.xG12OitDhdV/yIW5b8R.Lr0XSILj9rqHjlpe";

export const POST = route(async (request) => {
  const input = loginSchema.parse(await readJson(request));
  rateLimit(`login:${clientIp(request)}:${input.email}`, 8, FIFTEEN_MINUTES);

  const student = await findStudentForLogin(input.email);
  const passwordOk = await verifyPassword(input.password, student?.password_hash ?? DUMMY_HASH);
  if (!student || !passwordOk) throw new ApiError(401, "Incorrect email or password");
  if (!student.is_active) throw new ApiError(403, "This account has been deactivated by an admin");

  await recordLogin(student.student_id);
  await startSession(student);
  return ok({ user: { student_id: student.student_id, full_name: student.full_name, role: student.role } });
});
