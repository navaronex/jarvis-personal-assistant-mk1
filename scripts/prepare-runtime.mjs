// Node viaja dentro del instalador. El usuario final no tiene que instalarlo.
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const version = "24.15.0";
const base = `https://nodejs.org/dist/v${version}/`;
const directory = fileURLToPath(new URL("../runtime/", import.meta.url));
const target = path.join(directory, "node.exe");
async function hash(file) {
  const result = createHash("sha256");
  for await (const chunk of createReadStream(file)) result.update(chunk);
  return result.digest("hex");
}
async function request(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(300000) });
  if (!response.ok)
    throw Error(`Descarga oficial fallida: HTTP ${response.status}`);
  return response;
}
await mkdir(directory, { recursive: true });
const sums = await (await request(base + "SHASUMS256.txt")).text();
const expected = sums.match(/^([a-f0-9]{64})\s+win-x64\/node\.exe\s*$/m)?.[1];
if (!expected)
  throw Error("La distribución oficial no contiene el ejecutable esperado.");
if ((await hash(target).catch(() => "")) !== expected) {
  const temp = path.join(directory, "node.exe.download");
  try {
    await pipeline(
      (await request(base + "win-x64/node.exe")).body,
      createWriteStream(temp),
    );
    if ((await hash(temp)) !== expected)
      throw Error("La verificación SHA-256 de Node ha fallado.");
    await rename(temp, target);
  } finally {
    await rm(temp, { force: true });
  }
}
console.log(`Node ${version} x64 verificado mediante SHA-256.`);
