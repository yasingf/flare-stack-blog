import { appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

// A binding is added only after this account check. A failure disables AI;
// deployment, local score viewing and MIDI practice can still proceed.
let enabled = false;
try {
  const value: unknown = JSON.parse(
    execFileSync("bunx", ["cf", "accounts", "subscriptions", "get"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
    }),
  );
  if (!Array.isArray(value))
    throw new Error("Unrecognized subscription response");
  if (
    value.some(
      (item) => !item?.rate_plan || typeof item.rate_plan.id !== "string",
    )
  )
    throw new Error("Unrecognized subscription plan");
  enabled = !value.some(
    (subscription: {
      rate_plan?: { id?: string; public_name?: string };
      product?: { name?: string; public_name?: string };
    }) => {
      const name = [
        subscription.rate_plan?.id,
        subscription.rate_plan?.public_name,
        subscription.product?.name,
        subscription.product?.public_name,
      ]
        .join(" ")
        .toLowerCase();
      return (
        /workers|worker[_ -]?paid|workers[_ -]?ai/.test(name) &&
        !/\bfree\b/.test(name)
      );
    },
  );
} catch {
  console.log("Could not verify Workers Free; piano AI remains disabled.");
}
if (process.env.GITHUB_ENV)
  appendFileSync(process.env.GITHUB_ENV, `PIANO_AI_ENABLED=${enabled}\n`);
console.log(`PIANO_AI_ENABLED=${enabled}`);
if (enabled)
  console.log(
    "Workers Free confirmed. Piano AI: 50 calls/day site-wide, 3/user, 100-neuron reservation/call. No paid fallback.",
  );
