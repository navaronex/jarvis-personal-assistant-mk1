/* global guard, notify */
// La misma interfaz puede abrirse en navegador; estos controles sólo existen en Electron.
(() => {
  const desktop = window.jarvisDesktop;
  if (!desktop) return;
  const element = (id) => document.getElementById(id);
  element("desktop-settings").hidden = false;
  element("desktop-ai").hidden = false;
  element("notifications").hidden = true;
  element("reminder-line").textContent =
    "Jarvis avisa 15 minutos antes y a la hora del compromiso. Al cerrar esta ventana sigue junto al reloj; el PC debe estar encendido y sin suspender.";

  function render(status) {
    element("desktop-version").textContent =
      `Jarvis ${status.version} · ${status.packaged ? "Aplicación instalada" : "Modo de desarrollo"}`;
    element("desktop-login").disabled = !status.packaged;
    element("desktop-login").checked = status.loginEnabled;
    element("desktop-update-status").textContent = status.updates.message;
    element("desktop-check").disabled =
      !status.packaged ||
      ["checking", "downloading", "ready"].includes(status.updates.phase);
    element("desktop-install").hidden = status.updates.phase !== "ready";
    element("desktop-ai-status").textContent = status.ai.message;
    element("desktop-prepare-ai").disabled = status.ai.phase === "preparing";
  }
  desktop.onStatus(render);
  element("desktop-login").onchange = guard(async () => {
    try {
      render(await desktop.setLogin(element("desktop-login").checked));
    } finally {
      render(await desktop.status());
    }
  });
  element("desktop-check").onclick = guard(async () => {
    element("desktop-check").disabled = true;
    try {
      await desktop.checkUpdates();
    } finally {
      render(await desktop.status());
    }
  });
  element("desktop-install").onclick = guard(() => desktop.installUpdate());
  element("desktop-data").onclick = guard(() => desktop.openData());
  element("desktop-notification").onclick = guard(async () => {
    const shown = await desktop.testNotification();
    notify(
      shown
        ? "Aviso enviado a Windows. Revisa también su centro de notificaciones."
        : "Windows no confirmó el aviso. Revisa los permisos de notificación y el modo No molestar.",
    );
  });
  element("desktop-prepare-ai").onclick = guard(async () =>
    render(await desktop.prepareAI()),
  );
  void guard(async () => render(await desktop.status()))();
})();
