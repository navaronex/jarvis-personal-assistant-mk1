const {
  app,
  BrowserWindow,
  dialog,
  Tray,
  Menu,
  Notification,
  ipcMain,
  shell,
} = require("electron");
const { fork, spawn } = require("node:child_process");
const {
  mkdirSync,
  appendFileSync,
  existsSync,
  statSync,
  renameSync,
} = require("node:fs");
const path = require("node:path");
const { autoUpdater } = require("electron-updater");
const { UpdateController } = require("./updates.cjs");
const { ReminderPoller } = require("./reminders.cjs");

const root = path.resolve(__dirname, "..");
const backendRoot = app.isPackaged
  ? path.join(process.resourcesPath, "backend")
  : root;
const runtime = path.join(
  app.isPackaged ? process.resourcesPath : root,
  "runtime",
  "node.exe",
);
const icon = path.join(
  app.isPackaged
    ? path.join(process.resourcesPath, "icons")
    : path.join(root, "build"),
  "icon.ico",
);
const smoke = process.argv.includes("--jarvis-smoke");
// Mantiene la ubicación que ya utilizaba la versión del usuario antes de añadir productName.
app.setPath("userData", path.join(app.getPath("appData"), "jarvis-personal"));
if (smoke) {
  if (
    !process.env.JARVIS_SMOKE_DATA_DIR ||
    !path.isAbsolute(process.env.JARVIS_SMOKE_DATA_DIR)
  )
    throw Error("La prueba necesita una carpeta temporal absoluta.");
  app.setPath("userData", process.env.JARVIS_SMOKE_DATA_DIR);
}
const dataRoot = app.getPath("userData");
mkdirSync(dataRoot, { recursive: true });
const logFile = path.join(dataRoot, "desktop.log");
function log(message) {
  try {
    if (existsSync(logFile) && statSync(logFile).size > 1_000_000)
      renameSync(logFile, logFile + ".previous");
    appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`);
  } catch {
    /* Un fallo del registro no debe impedir usar la agenda. */
  }
}

let mainWindow,
  tray,
  backend,
  address,
  poller,
  updateTimer,
  reminderTimer,
  firstCheck;
let quitting = false,
  stopped = false,
  quitPromise,
  aiProcess,
  setupProcess;
let aiState = {
  phase: "idle",
  message: "Puedes preparar el modelo local desde aquí.",
};
let updater;
const liveNotifications = new Set();

function status() {
  return {
    version: app.getVersion(),
    packaged: app.isPackaged,
    loginEnabled: app.isPackaged && app.getLoginItemSettings().openAtLogin,
    updates: updater?.snapshot() || { phase: "idle", message: "Iniciando…" },
    ai: { ...aiState },
  };
}
function emitStatus() {
  if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send("desktop:status", status());
  if (tray) buildTrayMenu();
}
function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}
function buildTrayMenu() {
  const ready = updater?.state.phase === "ready";
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Abrir Jarvis", click: showWindow },
      {
        label: "Comprobar actualizaciones",
        click: () => {
          showWindow();
          updater.check();
        },
      },
      {
        label: "Reiniciar para actualizar",
        enabled: ready,
        click: () => installUpdate().catch((e) => log(e.message)),
      },
      { type: "separator" },
      {
        label: "Iniciar con Windows",
        type: "checkbox",
        enabled: app.isPackaged,
        checked: status().loginEnabled,
        click: (item) => setLogin(item.checked),
      },
      { label: "Salir de Jarvis", click: () => app.quit() },
    ]),
  );
}
function setLogin(enabled) {
  if (typeof enabled !== "boolean") throw Error("Valor no válido.");
  if (!app.isPackaged)
    throw Error("El inicio con Windows se activa en la versión instalada.");
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.execPath,
    args: ["--hidden"],
  });
  emitStatus();
  return status();
}
async function api(route, method = "GET", body) {
  const response = await fetch(address + "/api" + route, {
    method,
    headers: { "Content-Type": "application/json", "X-Jarvis": "local" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(5000),
  });
  const result = await response.json();
  if (!response.ok)
    throw Error(result.error || "El servidor no respondió correctamente.");
  return result;
}
function notify(alert) {
  if (!Notification.isSupported()) return Promise.resolve(false);
  return new Promise((resolve) => {
    const notification = new Notification({
      title: "Jarvis · " + alert.title,
      body: alert.body,
      icon,
    });
    liveNotifications.add(notification);
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => {
      liveNotifications.delete(notification);
      finish(false);
    }, 8000);
    notification.once("show", () => finish(true));
    notification.once("failed", (_event, error) => {
      liveNotifications.delete(notification);
      log("Notificación: " + error);
      finish(false);
    });
    notification.once("close", () => liveNotifications.delete(notification));
    notification.once("click", showWindow);
    notification.show();
  });
}
function startBackend() {
  return new Promise((resolve, reject) => {
    let output = "",
      errors = "",
      ready = false,
      settled = false;
    const timeout = setTimeout(
      () => fail(Error("El servidor no arrancó en 15 segundos.")),
      15000,
    );
    function fail(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    }
    backend = fork(path.join(backendRoot, "server.mjs"), [], {
      execPath: runtime,
      execArgv: [],
      cwd: backendRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      env: {
        ...process.env,
        JARVIS_PORT: "0",
        JARVIS_DATA_DIR: path.join(dataRoot, "datos"),
        JARVIS_DESKTOP: "1",
      },
    });
    backend.stdout.on("data", (chunk) => {
      output = (output + chunk.toString("utf8")).slice(-10000);
      const match = output.match(/Jarvis listo: (http:\/\/127\.0\.0\.1:\d+)/);
      if (match && !settled) {
        ready = true;
        settled = true;
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    backend.stderr.on("data", (chunk) => {
      errors = (errors + chunk.toString("utf8")).slice(-4000);
      log(chunk.toString("utf8"));
    });
    backend.once("error", fail);
    backend.once("exit", (code) => {
      backend = null;
      if (!ready)
        fail(
          Error(errors || `El servidor terminó durante el arranque (${code}).`),
        );
      else if (!quitting) {
        dialog.showErrorBox(
          "Jarvis se ha detenido",
          "El servidor local ha terminado. Vuelve a abrir Jarvis.",
        );
        app.quit();
      }
    });
  });
}
async function startLocalModel() {
  try {
    const r = await fetch("http://127.0.0.1:11434/api/tags", {
      signal: AbortSignal.timeout(2000),
    });
    if (r.ok) return;
  } catch { }
  const motor = path.join(dataRoot, "ai", "motor");
  if (!existsSync(path.join(motor, "jarvis-verified.json"))) return;
  if (aiProcess && aiProcess.exitCode === null) return;
  aiProcess = spawn(path.join(motor, "ollama.exe"), ["serve"], {
    windowsHide: true,
    stdio: "ignore",
    env: {
      ...process.env,
      OLLAMA_HOST: "127.0.0.1:11434",
      OLLAMA_MODELS: path.join(dataRoot, "ai", "modelos"),
      OLLAMA_NO_CLOUD: "1",
    },
  });
  aiProcess.once("error", (error) => {
    aiState = { phase: "error", message: "El motor local no pudo arrancar." };
    log(error.message);
    emitStatus();
  });
}
async function prepareAI() {
  if (setupProcess) return status();
  const choice = await dialog.showMessageBox(mainWindow, {
    type: "question",
    title: "Preparar inteligencia local",
    buttons: ["Preparar", "Cancelar"],
    defaultId: 1,
    cancelId: 1,
    message: "Se descargarán el motor oficial y un modelo local.",
    detail:
      "La primera preparación requiere Internet, varios GB de descarga y al menos 10 GB libres. No tiene coste de API. Las tareas seguirán disponibles.",
  });
  if (choice.response !== 0 || setupProcess || quitting) return status();
  aiState = { phase: "preparing", message: "Iniciando preparación…" };
  emitStatus();
  setupProcess = spawn(runtime, [path.join(backendRoot, "setup.mjs")], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      JARVIS_AI_DIR: path.join(dataRoot, "ai"),
      JARVIS_BACKEND_URL: address,
    },
  });
  let lines = "",
    errors = "";
  setupProcess.stdout.on("data", (chunk) => {
    lines += chunk.toString("utf8");
    const parts = lines.split(/\r?\n/);
    lines = parts.pop();
    for (const line of parts)
      if (line.trim()) {
        aiState = { phase: "preparing", message: line.trim() };
        emitStatus();
      }
  });
  setupProcess.stderr.on("data", (chunk) => {
    errors = (errors + chunk.toString("utf8")).slice(-2000);
  });
  setupProcess.once("error", (error) => {
    errors = error.message;
  });
  setupProcess.once("close", async (code) => {
    setupProcess = null;
    aiState =
      code === 0
        ? {
          phase: "ready",
          message:
            "IA preparada. Comprueba la conexión y selecciona el modelo.",
        }
        : {
          phase: "error",
          message:
            "No se completó la preparación. Puedes volver a intentarlo.",
        };
    if (errors) log("Preparación: " + errors);
    if (code === 0 && !quitting) await startLocalModel();
    emitStatus();
  });
  return status();
}
function authorizeIPC(event) {
  if (
    !mainWindow ||
    event.sender !== mainWindow.webContents ||
    event.senderFrame !== mainWindow.webContents.mainFrame ||
    new URL(event.senderFrame.url).origin !== address
  )
    throw Error("Ventana no autorizada.");
}
function registerIPC() {
  const handle = (name, fn) =>
    ipcMain.handle(name, async (event, ...args) => {
      authorizeIPC(event);
      return fn(...args);
    });
  handle("desktop:status", status);
  handle("desktop:check-updates", () => updater.check());
  handle("desktop:install-update", installUpdate);
  handle("desktop:set-login", setLogin);
  handle("desktop:open-data", async () => {
    const error = await shell.openPath(path.join(dataRoot, "datos"));
    if (error) throw Error(error);
  });
  handle("desktop:test-notification", () =>
    notify({
      title: "Prueba de recordatorio",
      body: "Jarvis puede avisarte aunque cierres su ventana.",
    }),
  );
  handle("desktop:prepare-ai", prepareAI);
}
async function stopServices() {
  clearInterval(reminderTimer);
  clearInterval(updateTimer);
  clearTimeout(firstCheck);
  if (aiProcess && aiProcess.exitCode === null) aiProcess.kill();
  if (backend && backend.exitCode === null) {
    const child = backend;
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        child.kill();
      }, 6000);
      const deadline = setTimeout(resolve, 8000);
      child.once("exit", () => {
        clearTimeout(timeout);
        clearTimeout(deadline);
        resolve();
      });
      if (child.connected)
        child.send({ type: "jarvis:shutdown" }, (error) => {
          if (error) child.kill();
        });
      else child.kill();
    });
  }
  stopped = true;
}
async function installUpdate() {
  if (updater.state.phase !== "ready") return status();
  if (setupProcess)
    throw Error("Espera a que termine la preparación de la IA.");
  const choice = await dialog.showMessageBox(mainWindow, {
    type: "question",
    buttons: ["Reiniciar y actualizar", "Más tarde"],
    defaultId: 1,
    cancelId: 1,
    message: "Guarda los formularios que tengas abiertos antes de reiniciar.",
  });
  if (choice.response !== 0) return status();
  quitting = true;
  await stopServices();
  autoUpdater.quitAndInstall(false, true);
  return status();
}
async function startApplication() {
  app.setAppUserModelId("com.navaronex.jarvis");
  address = await startBackend();
  autoUpdater.logger = {
    info: (message) => log("Actualizador: " + message),
    warn: (message) => log("Actualizador: " + message),
    error: (message) => log("Actualizador: " + message),
    debug: () => { },
  };
  updater = new UpdateController(autoUpdater, {
    packaged: app.isPackaged && !smoke,
    version: app.getVersion(),
    onChange: emitStatus,
  });
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 760,
    minHeight: 600,
    title: "Jarvis",
    icon,
    backgroundColor: "#f3f6f7",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  // No lanzar un instalador cuando Windows está cerrando la sesión.
  mainWindow.on("query-session-end", () => {
    autoUpdater.autoInstallOnAppQuit = false;
  });
  mainWindow.on("session-end", () => {
    autoUpdater.autoInstallOnAppQuit = false;
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== address) event.preventDefault();
  });
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  mainWindow.webContents.session.setPermissionCheckHandler(() => false);
  mainWindow.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  tray = new Tray(icon);
  tray.setToolTip("Jarvis · Recordatorios activos");
  tray.on("double-click", showWindow);
  buildTrayMenu();
  registerIPC();
  await mainWindow.loadURL(address);
  if (smoke) {
    const result = {
      health: await api("/health"),
      tray: "Jarvis · Recordatorios activos",
      title: mainWindow.getTitle(),
      version: app.getVersion(),
      packaged: app.isPackaged,
    };
    result.renderer = await mainWindow.webContents
      .executeJavaScript(`(async () => ({
      version: (await window.jarvisDesktop.status()).version,
      settingsVisible: !document.getElementById('desktop-settings').hidden,
      nodeUnavailable: typeof require === 'undefined' && typeof process === 'undefined'
    }))()`);
    mainWindow.close();
    result.hideOnClose = !mainWindow.isDestroyed() && !mainWindow.isVisible();
    process.stdout.write("JARVIS_SMOKE " + JSON.stringify(result) + "\n");
    app.quit();
    return;
  }
  if (!process.argv.includes("--hidden")) showWindow();
  poller = new ReminderPoller({
    api,
    show: notify,
    onError: (error) => log("Recordatorios: " + error.message),
  });
  reminderTimer = setInterval(() => poller.tick(), 20000);
  poller.tick();
  firstCheck = setTimeout(() => updater.check(), 15000);
  updateTimer = setInterval(() => updater.check(), 6 * 60 * 60 * 1000);
  startLocalModel().catch((error) => log(error.message));
}
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
else {
  app.on("second-instance", showWindow);
  app
    .whenReady()
    .then(startApplication)
    .catch((error) => {
      log(error.stack || error.message);
      if (smoke) {
        console.error(error);
        app.exit(1);
      } else {
        dialog.showErrorBox("Jarvis no pudo arrancar", error.message);
        app.quit();
      }
    });
  app.on("activate", showWindow);
  app.on("window-all-closed", () => {
    /* La bandeja mantiene el asistente en marcha. */
  });
  app.on("before-quit", (event) => {
    if (stopped) {
      tray?.destroy();
      return;
    }
    event.preventDefault();
    if (quitPromise) return;
    if (setupProcess) {
      dialog.showMessageBox(mainWindow, {
        message: "Espera a que termine la preparación de la IA antes de salir.",
      });
      return;
    }
    quitting = true;
    quitPromise = stopServices().finally(() => app.quit());
  });
}
