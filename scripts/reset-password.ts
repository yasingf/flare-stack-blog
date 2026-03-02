/**
 * Reset admin password in local D1 SQLite database
 * Usage: bun run scripts/reset-password.ts <new-password>
 */
// @ts-nocheck - Script uses bun:sqlite which is not typed in project tsconfig
import { hex } from "@better-auth/utils/hex";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { Database } from "bun:sqlite";
import { readdirSync } from "fs";
import { join } from "path";

const SCRYPT_CONFIG = {
  N: 16384,
  r: 16,
  p: 1,
  dkLen: 64,
};

async function hashPassword(password: string): Promise<string> {
  const salt = hex.encode(crypto.getRandomValues(new Uint8Array(16)));
  const key = await scryptAsync(password.normalize("NFKC"), salt, {
    N: SCRYPT_CONFIG.N,
    p: SCRYPT_CONFIG.p,
    r: SCRYPT_CONFIG.r,
    dkLen: SCRYPT_CONFIG.dkLen,
    maxmem: 128 * SCRYPT_CONFIG.N * SCRYPT_CONFIG.r * 2,
  });
  return `${salt}:${hex.encode(key)}`;
}

async function main() {
  const newPassword = process.argv[2];
  if (!newPassword) {
    console.error("Usage: bun run scripts/reset-password.ts <new-password>");
    process.exit(1);
  }

  const dbDir = join(
    process.cwd(),
    ".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
  );

  const files = readdirSync(dbDir).filter((f) => f.endsWith(".sqlite"));
  if (files.length === 0) {
    console.error("No SQLite database found in", dbDir);
    process.exit(1);
  }

  const dbPath = join(dbDir, files[0]);
  console.log("Using database:", dbPath);

  const db = new Database(dbPath);

  const users = db.prepare("SELECT id, email, name, role FROM user").all() as Array<{
    id: string;
    email: string;
    name: string;
    role: string;
  }>;
  console.log("Users found:", JSON.stringify(users, null, 2));

  const adminUser = users.find((u) => u.role === "admin");
  if (!adminUser) {
    console.error("No admin user found");
    db.close();
    process.exit(1);
  }

  console.log(`Admin user: ${adminUser.email} (${adminUser.id})`);

  console.log("Hashing new password...");
  const hashedPassword = await hashPassword(newPassword);
  console.log("Password hashed successfully");

  const result = db
    .prepare(
      `UPDATE account SET password = ? WHERE user_id = ? AND provider_id = 'credential'`,
    )
    .run(hashedPassword, adminUser.id);

  if (result.changes === 0) {
    console.log("No credential account found, creating one...");
    const accountId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (?, ?, 'credential', ?, ?, ?, ?)`,
    ).run(
      accountId,
      adminUser.id,
      adminUser.id,
      hashedPassword,
      Date.now(),
      Date.now(),
    );
    console.log("Credential account created");
  } else {
    console.log(`Password updated for ${result.changes} account(s)`);
  }

  db.close();
  console.log("Done: Password has been reset successfully!");
}

main().catch(console.error);
