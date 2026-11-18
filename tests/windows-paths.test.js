import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { scanFilesystem } from "../src/scanners/filesystem.js";
import { traceTerm } from "../src/core/trace.js";

const fixture = fileURLToPath(new URL("../examples/order-flow/", import.meta.url));

for (const lineEnding of ["\n", "\r\n"]) {
test(`order-flow preserves layers and call chains (${JSON.stringify(lineEnding)})`, () => {
  // A neutral parent avoids classifying files from the checkout's directory names.
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "huella-paths-"));
  try {
    fs.cpSync(fixture, temp, { recursive: true });
    for (const file of scanFilesystem(temp)) {
      const content = fs.readFileSync(file.path, "utf8").replace(/\r?\n/g, lineEnding);
      fs.writeFileSync(file.path, content);
    }
    const catalog = scanFilesystem(temp);
    for (const [folder, layer, order] of [
      ["controllers", "entry", 1],
      ["services", "service", 2],
      ["repositories", "data", 3],
    ]) {
      const file = catalog.find((item) => item.path === path.join(temp, folder, "orders.js"));
      assert.ok(file, `${folder}/orders.js is scanned`);
      assert.equal(file.layer, layer);
      assert.equal(file.order, order);
    }
    assert.equal(catalog.find((item) => item.name === "checkout.js").layer, "file");

    const trace = traceTerm("createOrder", temp);
    assert.deepEqual(
      trace.chains.map((chain) => chain.map((hit) => hit.block.funcName)),
      [["postOrder", "createOrder"], ["createOrder", "insertOrder"]],
    );
    assert.equal(trace.endpoints.length, 1);
    assert.equal(trace.uiEndpointEdges.length, 1);
    assert.ok(trace.hits.every((hit) => fs.existsSync(hit.filePath)), "output paths remain usable");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
}
