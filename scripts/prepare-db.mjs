import { execSync } from "node:child_process";

function resolveRemoteDbUrl() {
  const candidates = [
    process.env.POSTGRES_URL,
    process.env.PRISMA_DATABASE_URL,
    process.env.DATABASE_URL,
    process.env.STORAGE_URL,
  ];
  for (const candidate of candidates) {
    const trimmed = (candidate || "").trim();
    if (
      trimmed &&
      !trimmed.includes("@localhost:5432") &&
      !trimmed.includes("@127.0.0.1:5432")
    ) {
      return trimmed;
    }
  }
  return "";
}

const remoteUrl = resolveRemoteDbUrl();
if (remoteUrl) {
  process.env.DATABASE_URL = remoteUrl;
}

try {
  console.log("[prepare-db] Generating Prisma Client...");
  execSync("npx prisma generate", { stdio: "inherit", env: process.env });
} catch (err) {
  console.warn("[prepare-db] Warning during prisma generate:", err?.message || err);
}

if (remoteUrl) {
  try {
    console.log("[prepare-db] Remote Postgres URL detected. Pushing Prisma schema (creating tables)...");
    execSync("npx prisma db push --accept-data-loss", {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: remoteUrl },
    });
    console.log("[prepare-db] Database tables verified and ready.");
  } catch (err) {
    console.warn("[prepare-db] Could not push schema during build:", err?.message || err);
  }
} else {
  console.log("[prepare-db] Local/fallback DATABASE_URL detected. Skipping remote db push.");
}
