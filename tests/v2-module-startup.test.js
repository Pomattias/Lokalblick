import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Node --check parses actual imports as ES modules. Stripping import lines
// before syntax tests misses fatal duplicate lexical declarations.
for (const name of ["app.js","views.js","model.js","editor.js",
                    "transport.js","import-workspace.js","restore-policy.js"]) {
  test("V2 ES module compiles: "+name, () => {
    const path=fileURLToPath(new URL("../frontend/v2/"+name,import.meta.url));
    const result=spawnSync(process.execPath,["--check",path],{encoding:"utf8",timeout:15000});
    assert.equal(result.status,0,result.stderr||result.error?.message||"Parser failed");
  });
}
