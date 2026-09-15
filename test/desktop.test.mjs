import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { UpdateController } from "../electron/updates.cjs";
import { ReminderPoller } from "../electron/reminders.cjs";

test("Actualizador: desarrollo no consulta Internet", async () => {
  const driver = new EventEmitter();
  driver.checkForUpdates = () => assert.fail("No debe consultar en desarrollo");
  const controller = new UpdateController(driver, {
    packaged: false,
    version: "0.3.0",
  });
  assert.equal((await controller.check()).phase, "development");
});

test("Actualizador: evita consultas simultáneas y conserva la descarga preparada", async () => {
  const driver = new EventEmitter();
  let finish,
    calls = 0;
  driver.checkForUpdates = () => {
    calls++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const controller = new UpdateController(driver, {
    packaged: true,
    version: "0.3.0",
  });
  const first = controller.check();
  await controller.check();
  assert.equal(calls, 1);
  driver.emit("update-available", { version: "0.4.0" });
  driver.emit("download-progress", { percent: 42.6 });
  assert.equal(controller.snapshot().progress, 43);
  finish();
  await first;
  await controller.check();
  assert.equal(calls, 1);
  driver.emit("update-downloaded", { version: "0.4.0" });
  assert.equal((await controller.check()).phase, "ready");
  assert.equal(calls, 1);
  assert.equal(driver.autoDownload, true);
  assert.equal(driver.autoInstallOnAppQuit, true);
  assert.equal(driver.allowDowngrade, false);
});

test("Actualizador: se recupera tras perder la conexión", async () => {
  const driver = new EventEmitter();
  driver.checkForUpdates = async () => {
    throw Error("offline");
  };
  const controller = new UpdateController(driver, {
    packaged: true,
    version: "0.3.0",
  });
  assert.equal((await controller.check()).phase, "error");
  driver.checkForUpdates = async () => driver.emit("update-not-available");
  assert.equal((await controller.check()).phase, "current");
  const snapshot = controller.snapshot();
  snapshot.phase = "changed";
  assert.equal(controller.snapshot().phase, "current");
});

test("Recordatorios: Windows debe confirmar el aviso antes de marcarlo entregado", async () => {
  let ack = 0;
  const poller = new ReminderPoller({
    api: async (route) => {
      if (route === "/reminders") return { alerts: [{ id: "a" }] };
      ack++;
    },
    show: async () => false,
  });
  await poller.tick();
  assert.equal(ack, 0);
  poller.show = async () => true;
  await poller.tick();
  assert.equal(ack, 1);
});

test("Recordatorios: un acuse fallido se reintenta sin duplicar la notificación", async () => {
  let shown = 0,
    ack = 0,
    errors = 0;
  const poller = new ReminderPoller({
    api: async (route) => {
      if (route === "/reminders") return { alerts: [{ id: "a" }] };
      if (++ack === 1) throw Error("El servidor se está reiniciando");
    },
    show: async () => {
      shown++;
      return true;
    },
    onError: () => errors++,
  });
  await poller.tick();
  await poller.tick();
  assert.equal(shown, 1);
  assert.equal(ack, 2);
  assert.equal(errors, 1);
  assert.equal(poller.shown.size, 0);
});

test("Recordatorios: impide dos entregas concurrentes", async () => {
  let finish,
    calls = 0;
  const poller = new ReminderPoller({
    api: async (route) => {
      if (route === "/reminders") {
        calls++;
        return new Promise((resolve) => {
          finish = resolve;
        });
      }
    },
    show: async () => true,
  });
  const first = poller.tick();
  await poller.tick();
  assert.equal(calls, 1);
  finish({ alerts: [] });
  await first;
  assert.equal(poller.busy, false);
});
