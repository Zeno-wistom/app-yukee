/** Isolated comparison preview. Never merges or rewrites any branch. */
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(dirname(root), "Yukee-hark-g03-experience-v2");
const git = (args, cwd = root) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
const free = () =>
  new Promise((res, rej) => {
    const s = createServer();
    s.once("error", () =>
      rej(
        new Error(
          "5175 is occupied. No process stopped and no other port selected.",
        ),
      ),
    );
    s.listen({ port: 5175, host: "127.0.0.1", exclusive: true }, () =>
      s.close(res),
    );
  });
try {
  await free();
  if (
    !git([
      "ls-remote",
      "--heads",
      "origin",
      "refs/heads/hark/g03-experience-v2",
    ])
  ) {
    console.log(
      "Hark has not pushed this branch yet. Run this command again after it is ready.",
    );
    process.exit(2);
  }
  git([
    "fetch",
    "origin",
    "refs/heads/hark/g03-experience-v2:refs/remotes/origin/hark/g03-experience-v2",
  ]);
  if (existsSync(target)) {
    const registered = git(["worktree", "list", "--porcelain"]).split("\n");
    if (!registered.includes(`worktree ${target.replaceAll("\\", "/")}`))
      throw new Error(
        "Target exists but is not the expected registered worktree; left untouched.",
      );
    if (git(["status", "--porcelain"], target))
      throw new Error(
        "Existing Hark checkout has local changes; left untouched.",
      );
    if (
      git(["rev-parse", "HEAD"], target) !==
      git(["rev-parse", "origin/hark/g03-experience-v2"])
    )
      throw new Error(
        "Existing preview uses another commit; review it before replacing. No reset performed.",
      );
  } else
    git([
      "worktree",
      "add",
      "--detach",
      target,
      "origin/hark/g03-experience-v2",
    ]);
  const npmCli = join(
    dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js",
  );
  if (!existsSync(npmCli))
    throw new Error(
      "npm CLI not found next to Node; run npm ci --ignore-scripts inside the Hark worktree manually.",
    );
  execFileSync(process.execPath, [npmCli, "ci", "--ignore-scripts"], {
    cwd: target,
    stdio: "inherit",
    windowsHide: true,
  });
  const vite = join(target, "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(vite))
    throw new Error(
      "Expected Vite entry missing; no unfamiliar project script executed.",
    );
  await free();
  const child = spawn(
    process.execPath,
    [vite, "--host", "127.0.0.1", "--port", "5175", "--strictPort"],
    { cwd: target, detached: true, stdio: "ignore", windowsHide: true },
  );
  child.unref();
  console.log(
    "Hark: http://127.0.0.1:5175/  Codex: http://127.0.0.1:5174/  Original: http://127.0.0.1:5173/",
  );
  console.log(
    "Keyboard demos can run together. Test the real camera sequentially.",
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
