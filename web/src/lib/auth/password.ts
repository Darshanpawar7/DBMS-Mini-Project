import bcrypt from "bcryptjs";

// Cost 10 matches the CHECK constraint chk_student_pwd_bcrypt ($2b$10$...).
const BCRYPT_COST = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
