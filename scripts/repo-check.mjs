import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();

const required = [
  "README.md",
  "ARCHITECTURE.md",
  "backend/README.md",
  "frontend/app.js",
  "backend/src/data-repository.js",
  ".github/copilot-instructions.md"
];

const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error("Missing required repository files:");
  missing.forEach((file) => console.error(" - " + file));
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const jsFiles = ["frontend", "backend"]
  .flatMap((dir) => walk(path.join(root, dir)))
  .filter((file) => /\.(js|mjs)$/.test(file));

let failed = false;
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    failed = true;
    console.error("\nSyntax check failed: " + path.relative(root, file));
    console.error(result.stderr || result.stdout);
  }
}

const tracked = spawnSync("git", ["ls-files"], {
  cwd: root,
  encoding: "utf8",
  shell: process.platform === "win32"
});

if (tracked.status === 0) {
  const forbidden = tracked.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) =>
      (/(^|\/)\.env($|\.)/i.test(file) && !/(^|\/)\.env(?:\.[^.]+)*\.example$/i.test(file)) ||
      /\.(xlsx|xls|xlsm|sqlite|sqlite3|db)$/i.test(file) ||
      /(^|\/)(credentials|secrets)\.json$/i.test(file)
    );

  if (forbidden.length) {
    failed = true;
    console.error("\nPotential company data/secrets are tracked:");
    forbidden.forEach((file) => console.error(" - " + file));
  }
}

if (failed) process.exit(1);

console.log("Lokalblick preflight OK");
console.log("Checked " + jsFiles.length + " JavaScript files.");
console.log("No tracked blocked data/secret file types detected.");
