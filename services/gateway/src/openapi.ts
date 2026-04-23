import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildApp } from "./app.js";

const app = await buildApp();
await app.ready();

const outputDir = join(process.cwd(), "openapi");
await mkdir(outputDir, { recursive: true });
await writeFile(join(outputDir, "openapi.json"), `${JSON.stringify(app.swagger(), null, 2)}\n`);

await app.close();
