import { readFile, writeFile } from "node:fs/promises";

const workerPath = new URL("../.open-next/worker.js", import.meta.url);
const marker = 'import { createRequire } from "node:module";';
let worker = await readFile(workerPath, "utf8");

if (!worker.includes(marker)) {
  const shim = `${marker}
globalThis.require ??= createRequire("/worker/index.js");
`;
  await writeFile(workerPath, `${shim}${worker}`);
} else if (worker.includes("createRequire(import.meta.url)")) {
  worker = worker.replace(
    "createRequire(import.meta.url)",
    'createRequire("/worker/index.js")',
  );
  await writeFile(workerPath, worker);
}
