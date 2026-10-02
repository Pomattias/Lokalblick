import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { inspectLebFile } from "../backend/src/adapters/local-company-source-adapter.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");

function externalPath(input, label) {
  const resolved = path.resolve(input.trim());
  const relative = path.relative(root, resolved);
  if (relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))) {
    throw new Error(`${label} must be outside the Git repository`);
  }
  return resolved;
}

async function main() {
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const lebPath = externalPath(await terminal.question("Local LEB workbook path: "), "LEB path");
    const dataPath = externalPath(await terminal.question("Backend data file path: "), "Backend data path");
    const coordinatesInput = await terminal.question("Optional coordinates JSON path (leave blank to skip): ");
    const coordinatesPath = coordinatesInput.trim() ? externalPath(coordinatesInput, "Coordinates path") : "";
    if (path.extname(dataPath).toLowerCase() !== ".json") throw new Error("Backend data file must use a .json extension");
    if (coordinatesPath && path.extname(coordinatesPath).toLowerCase() !== ".json") {
      throw new Error("Coordinates file must use a .json extension");
    }
    if (new Set([lebPath, dataPath, coordinatesPath].filter(Boolean)).size !== 2 + Number(Boolean(coordinatesPath))) {
      throw new Error("Choose distinct source, backend data, and coordinates files");
    }
    await fs.access(lebPath);
    const counts = await inspectLebFile(lebPath);
    if (coordinatesPath) {
      await fs.access(coordinatesPath);
      JSON.parse(await fs.readFile(coordinatesPath, "utf8"));
    }
    const entries = {
      LOKALBLICK_SOURCE: "local-company",
      LOKALBLICK_HOST: "127.0.0.1",
      LOKALBLICK_PORT: "8787",
      LOKALBLICK_LEB_PATH: lebPath,
      LOKALBLICK_DATA_PATH: dataPath,
      LOKALBLICK_COORDINATES_PATH: coordinatesPath
    };
    const contents = Object.entries(entries)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n") + "\n";
    await fs.writeFile(envPath, contents, { mode: 0o600 });
    console.log(`Setup complete. SF rows: ${counts.sfRows}; EXT rows: ${counts.extRows}.`);
    console.log("Configuration saved locally; file paths were not displayed.");
  } finally {
    terminal.close();
  }
}

main().catch(() => {
  console.error("Setup failed. Verify the workbook sheets and choose valid paths outside the repository.");
  process.exitCode = 1;
});
