// Arranque real de Electron con datos aislados. No accede a la agenda personal.
const { spawn } = require("node:child_process");
const { mkdtempSync, readFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const executable = process.env.JARVIS_DESKTOP_EXE || require("electron");
const args = process.env.JARVIS_DESKTOP_EXE
  ? ["--jarvis-smoke"]
  : [root, "--jarvis-smoke"];
const data = mkdtempSync(path.join(os.tmpdir(), "jarvis-desktop-"));
const env = { ...process.env, JARVIS_SMOKE_DATA_DIR: data };
delete env.ELECTRON_RUN_AS_NODE;
let output = "",
  stderr = "";
const child = spawn(executable, args, {
  cwd: root,
  env,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
const timer = setTimeout(() => {
  child.kill();
  console.error("La prueba excedió 40 segundos.");
  process.exitCode = 1;
}, 40000);
child.stdout.on("data", (chunk) => {
  output += chunk;
});
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});
child.once("error", (error) => {
  clearTimeout(timer);
  console.error(error);
  process.exitCode = 1;
});
child.once("exit", (code) => {
  clearTimeout(timer);
  const match = output.match(/JARVIS_SMOKE (.+)/);
  if (code !== 0 || !match) {
    console.error(stderr || output || "Electron no devolvió el resultado.");
    process.exitCode = 1;
    return;
  }
  const result = JSON.parse(match[1]);
  const version = JSON.parse(
    readFileSync(path.join(root, "package.json"), "utf8"),
  ).version;
  if (
    result.health.version !== version ||
    !result.hideOnClose ||
    result.tray !== "Jarvis · Recordatorios activos" ||
    result.renderer.version !== version ||
    !result.renderer.settingsVisible ||
    !result.renderer.nodeUnavailable
  ) {
    console.error(result);
    process.exitCode = 1;
    return;
  }
  console.log("Electron, servidor, bandeja y ocultación al cerrar: OK");
  console.log(JSON.stringify(result, null, 2));
});
