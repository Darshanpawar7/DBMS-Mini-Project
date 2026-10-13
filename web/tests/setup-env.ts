import { existsSync } from "node:fs";
import path from "node:path";

// Unit tests need no secrets; DB tests read the same .env.local the app uses.
const envFile = path.resolve(__dirname, "..", ".env.local");
if (existsSync(envFile) && !process.env.DATABASE_URL) process.loadEnvFile(envFile);
