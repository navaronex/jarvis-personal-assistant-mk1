/** Preparación portátil. Solo se ejecuta cuando el usuario acepta preparar la IA. */
import { mkdir, access, rename, statfs, rm } from "node:fs/promises";
import { createWriteStream, createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.JARVIS_AI_DIR || sourceRoot;
await mkdir(root, { recursive: true });
const backendURL = process.env.JARVIS_BACKEND_URL || "http://127.0.0.1:3210";
const backendAddress = new URL(backendURL);
if (
  backendAddress.protocol !== "http:" ||
  backendAddress.hostname !== "127.0.0.1"
)
  throw Error("El servidor de Jarvis debe estar en este PC.");
const execute = promisify(execFile);
const api = "http://127.0.0.1:11434";
const model = "qwen2.5:3b";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let child;

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function tags() {
  const response = await fetch(api + "/api/tags", {
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok) throw Error("Ollama no responde.");
  return response.json();
}

try {
  if (process.platform !== "win32")
    throw Error("Esta preparación está diseñada para Windows.");
  const free = await statfs(root);
  if (free.bavail * free.bsize < 10 * 1024 ** 3)
    throw Error(
      "Se necesitan al menos 10 GB libres para preparar el motor y el modelo.",
    );
  let running = await tags().catch(() => null);
  if (!running) {
    const motor = path.join(root, "motor");
    const executable = path.join(motor, "ollama.exe");
    if (!(await exists(path.join(motor, "jarvis-verified.json")))) {
      console.log("Consultando la distribución oficial de Ollama…");
      const releaseResponse = await fetch(
        "https://api.github.com/repos/ollama/ollama/releases/latest",
        {
          headers: { "User-Agent": "Jarvis-Personal-Setup" },
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!releaseResponse.ok)
        throw Error(
          "GitHub no permite consultar la versión. Inténtalo más tarde.",
        );
      const release = await releaseResponse.json();
      const archiveName =
        process.arch === "arm64"
          ? "ollama-windows-arm64.zip"
          : "ollama-windows-amd64.zip";
      const asset = release.assets.find((item) => item.name === archiveName);
      if (
        !asset ||
        !/^https:\/\/github\.com\/ollama\/ollama\/releases\/download\//.test(
          asset.browser_download_url,
        ) ||
        !/^sha256:[a-f0-9]{64}$/.test(asset.digest || "")
      ) {
        throw Error(
          "No se ha encontrado un archivo oficial con SHA-256 verificable. No se ejecutará una descarga sin verificar.",
        );
      }
      const archive = path.join(root, "ollama-download.zip");
      console.log(
        `Descargando motor oficial (${Math.ceil(asset.size / 1024 ** 2)} MB). Puede tardar varios minutos…`,
      );
      const response = await fetch(asset.browser_download_url, {
        signal: AbortSignal.timeout(30 * 60 * 1000),
      });
      if (!response.ok || !response.body)
        throw Error("No se pudo descargar Ollama.");
      await pipeline(
        Readable.fromWeb(response.body),
        createWriteStream(archive),
      );
      console.log("Verificando SHA-256 antes de utilizar el motor…");
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(archive)) hash.update(chunk);
      if ("sha256:" + hash.digest("hex") !== asset.digest)
        throw Error("La descarga no supera la comprobación de integridad.");
      // Un directorio nuevo evita confundir una extracción incompleta con una instalación válida.
      const staging = path.join(root, "motor-" + Date.now());
      console.log("Extrayendo el motor verificado…");
      await execute(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          path.join(sourceRoot, "Extraer motor.ps1"),
          archive,
          staging,
        ],
        { windowsHide: true, timeout: 10 * 60 * 1000 },
      );
      if (!(await exists(path.join(staging, "ollama.exe"))))
        throw Error("El archivo no contiene ollama.exe en la ruta esperada.");
      if (await exists(motor))
        await rename(motor, path.join(root, "motor-anterior-" + Date.now()));
      await rename(staging, motor);
      const { writeFile } = await import("node:fs/promises");
      await writeFile(
        path.join(motor, "jarvis-verified.json"),
        JSON.stringify({
          release: release.tag_name,
          sha256: asset.digest,
          date: new Date().toISOString(),
        }),
      );
      await rm(archive); // Archivo exacto creado por este preparador; no se elimina ninguna carpeta.
    }
    child = spawn(executable, ["serve"], {
      windowsHide: true,
      stdio: "ignore",
      env: {
        ...process.env,
        OLLAMA_HOST: "127.0.0.1:11434",
        OLLAMA_MODELS: path.join(root, "modelos"),
        OLLAMA_NO_CLOUD: "1",
      },
    });
    let spawnError;
    child.on("error", (error) => {
      spawnError = error;
    });
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (spawnError) throw spawnError;
      running = await tags().catch(() => null);
      if (running) break;
      await delay(500);
    }
    if (!running) throw Error("El motor no ha podido arrancar.");
  }
  console.log(
    "Descargando el modelo Qwen 2.5 de 3B. Se puede reintentar si la conexión falla…",
  );
  const response = await fetch(api + "/api/pull", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, stream: false }),
    signal: AbortSignal.timeout(60 * 60 * 1000),
  });
  if (!response.ok || (await response.json()).status !== "success")
    throw Error("No se ha completado la descarga del modelo.");
  await fetch(backendURL + "/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Jarvis": "local" },
    body: JSON.stringify({ model }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
  console.log("Motor y modelo preparados. Puedes cerrar esta ventana.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) child.kill();
}
