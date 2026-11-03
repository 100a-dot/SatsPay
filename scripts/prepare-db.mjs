import { execSync } from "node:child_process";

const dbUrl = (process.env.DATABASE_URL || "").trim();
const isRemoteDb =
  Boolean(dbUrl) &&
  !dbUrl.includes("@localhost:5432") &&
  !dbUrl.includes("@127.0.0.1:5432");

try {
  console.log("[prepare-db] Generating Prisma Client...");
  execSync("npx prisma generate", { stdio: "inherit" });
} catch (err) {
  console.warn("[prepare-db] Warning during prisma generate:", err?.message || err);
}

if (isRemoteDb) {
  try {
    console.log("[prepare-db] Remote DATABASE_URL detected. Pushing Prisma schema (creating tables)...");
    execSync("npx prisma db push --accept-data-loss", { stdio: "inherit" });
    console.log("[prepare-db] Database tables verified and ready.");
  } catch (err) {
    console.warn("[prepare-db] Could not push schema during build:", err?.message || err);
  }
} else {
  console.log("[prepare-db] Local/fallback DATABASE_URL detected. Skipping remote db push.");
}
