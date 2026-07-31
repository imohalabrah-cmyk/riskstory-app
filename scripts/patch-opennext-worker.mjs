import { readFile, writeFile } from "node:fs/promises";

const workerPath = new URL("../.open-next/worker.js", import.meta.url);
const marker = 'import { createRequire } from "node:module";';
const scheduledMarker = "async scheduled(controller, env, ctx)";
let worker = await readFile(workerPath, "utf8");

if (!worker.includes(marker)) {
  const shim = `${marker}
globalThis.require ??= createRequire("/worker/index.js");
`;
  worker = `${shim}${worker}`;
} else if (worker.includes("createRequire(import.meta.url)")) {
  worker = worker.replace(
    "createRequire(import.meta.url)",
    'createRequire("/worker/index.js")',
  );
}

if (!worker.includes(scheduledMarker)) {
  const scheduledHandler = `export default {
    async scheduled(controller, env, ctx) {
        const headers = new Headers();
        if (env.CRON_SECRET) {
            headers.set("authorization", \`Bearer \${env.CRON_SECRET}\`);
        }
        const request = new Request(
            "https://riskstory.internal/api/open-interest/sync",
            { method: "POST", headers },
        );
        ctx.waitUntil(this.fetch(request, env, ctx).then(async (response) => {
            if (!response.ok) {
                const body = await response.text();
                throw new Error(\`OCC scheduled sync failed (\${response.status}): \${body}\`);
            }
        }));
    },
    async fetch`;
  worker = worker.replace("export default {\n    async fetch", scheduledHandler);
}

await writeFile(workerPath, worker);
