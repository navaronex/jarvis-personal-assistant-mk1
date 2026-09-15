// El controlador no depende de una ventana: podemos probar fallos de red sin instalar nada.
class UpdateController {
  constructor(updater, { packaged, version, onChange = () => {} }) {
    this.updater = updater;
    this.packaged = packaged;
    this.onChange = onChange;
    this.busy = false;
    this.state = {
      phase: packaged ? "idle" : "development",
      version,
      progress: 0,
      message: packaged
        ? "Se comprobarán las nuevas versiones automáticamente."
        : "Las actualizaciones se activan en la aplicación instalada.",
    };
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.on("checking-for-update", () =>
      this.change({
        phase: "checking",
        message: "Buscando una nueva versión…",
      }),
    );
    updater.on("update-available", (info) =>
      this.change({
        phase: "downloading",
        availableVersion: info.version,
        message: `Descargando Jarvis ${info.version}…`,
      }),
    );
    updater.on("download-progress", (info) =>
      this.change({
        phase: "downloading",
        progress: Math.round(info.percent),
        message: `Descargando actualización: ${Math.round(info.percent)} %`,
      }),
    );
    updater.on("update-not-available", () =>
      this.change({
        phase: "current",
        message: "Tienes la última versión publicada.",
      }),
    );
    updater.on("update-downloaded", (info) =>
      this.change({
        phase: "ready",
        availableVersion: info.version,
        progress: 100,
        message: `Jarvis ${info.version} está listo. Se instalará al salir.`,
      }),
    );
    updater.on("error", () =>
      this.change({
        phase: "error",
        message:
          "No se pudo comprobar o descargar la actualización. Revisa Internet; si es la primera versión, puede que todavía no exista una publicación.",
      }),
    );
  }

  change(patch) {
    this.state = { ...this.state, ...patch };
    this.onChange(this.snapshot());
  }

  snapshot() {
    return { ...this.state };
  }

  async check() {
    if (
      !this.packaged ||
      this.busy ||
      ["ready", "downloading"].includes(this.state.phase)
    )
      return this.snapshot();
    this.busy = true;
    try {
      await this.updater.checkForUpdates();
    } catch {
      this.change({
        phase: "error",
        message:
          "No se pudo comprobar la actualización. Jarvis seguirá funcionando y lo intentará más tarde.",
      });
    } finally {
      this.busy = false;
    }
    return this.snapshot();
  }
}
module.exports = { UpdateController };
