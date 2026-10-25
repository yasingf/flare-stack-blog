import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

// Fixed target deliberately excludes the existing production Worker, my-blog.
const worker = "my-blog-v361-preview";
const previewDomain = `${worker}.yasingfls.workers.dev`;
const mode = process.env.UPGRADE_RUNTIME_MODE;
if (mode !== "preview" && mode !== "production") {
  throw new Error("UPGRADE_RUNTIME_MODE must be preview or production");
}

function required(name: string) {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`Missing repository secret: ${name}`);
  return value;
}

required("CLOUDFLARE_API_TOKEN");
required("CLOUDFLARE_ACCOUNT_ID");
const values: Record<string, string> = {
  BETTER_AUTH_SECRET: required("BETTER_AUTH_SECRET"),
  GITHUB_CLIENT_ID: required("GITHUB_CLIENT_ID"),
  GITHUB_CLIENT_SECRET: required("GITHUB_CLIENT_SECRET"),
  BETTER_AUTH_URL:
    mode === "production"
      ? required("BETTER_AUTH_URL")
      : `https://${previewDomain}`,
  DOMAIN: mode === "production" ? required("DOMAIN") : previewDomain,
  ENVIRONMENT: mode === "production" ? "prod" : "dev",
  LOCALE: "zh",
};
for (const key of ["GITHUB_TOKEN", "TURNSTILE_SECRET_KEY"]) {
  const value = process.env[key];
  if (value) values[key] = value;
}
for (const key of [
  "UMAMI_WEBSITE_ID",
  "UMAMI_SRC",
  "UMAMI_API_KEY",
  "UMAMI_USERNAME",
  "UMAMI_PASSWORD",
]) {
  values[key] = mode === "production" ? process.env[key] || "" : "";
}

const directory = await mkdtemp(join(tmpdir(), "fsb-upgrade-runtime-"));
try {
  const file = join(directory, "secrets.json");
  const secrets = Object.fromEntries(
    Object.entries(values).map(([name, text]) => [
      name,
      { name, text, type: "secret_text" },
    ]),
  );
  await writeFile(file, JSON.stringify({ secrets }), { mode: 0o600 });
  try {
    // Capture output without logging it: the API may return binding values.
    await promisify(execFile)("bunx", [
      "cf",
      "workers",
      "secrets",
      "bulk",
      "--worker",
      worker,
      "--file",
      file,
    ]);
  } catch (error) {
    let safeError =
      error && typeof error === "object" && "stderr" in error
        ? String(error.stderr)
        : "cf exited unsuccessfully";
    for (const value of Object.values(process.env)) {
      if (value && value.length >= 4)
        safeError = safeError.replaceAll(value, "[redacted]");
    }
    throw new Error(`Cloudflare runtime update failed: ${safeError}`);
  }
  console.log(
    `Configured ${Object.keys(values).length} bindings on ${worker} (${mode}).`,
  );
  console.log("Production Worker, domains, and databases were not changed.");
} finally {
  await rm(directory, { recursive: true, force: true });
}
