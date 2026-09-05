import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

const execAsync = promisify(exec);

// Regression test for lib/api.ts's build-time guard: a production build
// with no NEXT_PUBLIC_API_URL must fail loudly instead of silently shipping
// the http://127.0.0.1:8000 dev fallback to real visitors. This spawns a
// real `next build` (not just importing the module) because the failure
// mode being guarded against IS the build output, not just the source.
//
// This runs its own extra `next build` in the same project directory that
// Playwright's webServer already built successfully. Safe to overlap with
// the other specs' browser tests against the already-running static server:
// this build is designed to fail during page-data collection, before Next's
// static export ever touches `out/` — the directory `serve` is reading from
// — so the running server keeps serving the good build throughout.
test("production build fails loudly when NEXT_PUBLIC_API_URL is missing", async () => {
  test.setTimeout(120_000);

  const projectRoot = path.resolve(__dirname, "..");
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production" };
  delete env.NEXT_PUBLIC_API_URL;

  // Deleting the var from *this process's* env isn't enough on its own —
  // Next's own dotenv loader (@next/env) reads .env.local directly and
  // fills in anything not already in process.env, which would silently
  // supply the value right back. Move the file aside for the duration of
  // this one build so there's really nowhere for it to come from.
  const envLocalPath = path.join(projectRoot, ".env.local");
  const envLocalBackupPath = path.join(projectRoot, ".env.local.tmp-hidden-for-test");
  const hadEnvLocal = await fs
    .access(envLocalPath)
    .then(() => true)
    .catch(() => false);
  if (hadEnvLocal) {
    await fs.rename(envLocalPath, envLocalBackupPath);
  }

  let failed = false;
  let output = "";
  try {
    const result = await execAsync("npx next build", { cwd: projectRoot, env });
    output = result.stdout + result.stderr;
  } catch (err) {
    failed = true;
    const e = err as { stdout?: string; stderr?: string };
    output = (e.stdout ?? "") + (e.stderr ?? "");
  } finally {
    if (hadEnvLocal) {
      await fs.rename(envLocalBackupPath, envLocalPath);
    }
  }

  expect(failed, "next build must exit non-zero when NEXT_PUBLIC_API_URL is missing in production").toBe(true);
  expect(output).toContain("NEXT_PUBLIC_API_URL is not set");
});
