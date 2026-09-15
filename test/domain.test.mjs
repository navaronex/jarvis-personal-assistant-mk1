import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { taskFields, readJson } from "../lib/validation.mjs";
import { taskReminder } from "../lib/reminders.mjs";
import { MailMonitor } from "../lib/mail-monitor.mjs";
import { classifyMail } from "../mail.mjs";

test("rechaza fechas imposibles y no confunde cero con ausencia de fecha", () => {
  for (const due of ["2026-02-30T12:00:00.000Z", 0, "mañana"]) {
    assert.throws(
      () => taskFields({ title: "Reunión", due, priority: "normal" }),
      { status: 400 },
    );
  }
});

test("JSON UTF-8 conserva una letra dividida entre paquetes", async () => {
  const buffer = Buffer.from('{"title":"Reunión 📦"}');
  const chunks = [...buffer].map((byte) => Buffer.from([byte]));
  assert.deepEqual(await readJson(Readable.from(chunks)), {
    title: "Reunión 📦",
  });
});

test("rechaza JSON malformado, null, arrays y cuerpos demasiado grandes", async () => {
  for (const value of ["{", "null", "[]", "42"]) {
    await assert.rejects(readJson(Readable.from([Buffer.from(value)])), {
      status: 400,
    });
  }
  await assert.rejects(readJson(Readable.from([Buffer.alloc(12)]), 10), {
    status: 413,
  });
});

test("el aviso cambia exactamente a los 15 minutos y al vencimiento", () => {
  const task = {
    id: "ejemplo",
    title: "Reunión",
    due: "2026-09-20T10:00:00.000Z",
    done: 0,
  };
  const due = Date.parse(task.due);
  assert.equal(taskReminder(task, due - 900001), null);
  assert.match(taskReminder(task, due - 900000).id, /soon$/);
  assert.match(taskReminder(task, due).id, /due$/);
  assert.equal(taskReminder({ ...task, done: 1 }, due), null);
  assert.equal(taskReminder({ ...task, due: "" }, due), null);
});

test("un paquete perdido dispara revisión y un mensaje neutro no", () => {
  assert.equal(
    classifyMail("Paquete perdido", "No encontramos el envío").urgent,
    true,
  );
  assert.equal(
    classifyMail("Horario semanal", "Adjunto planificación del mes").urgent,
    false,
  );
  assert.equal(classifyMail("Revisar", "Información", 2).urgent, true);
});

test("la clasificación avisa de señales, no interpreta si una incidencia está resuelta", () => {
  // Limitación documentada: las palabras siguen estando en el mensaje.
  assert.equal(
    classifyMail("Paquete perdido: caso resuelto", "Entregado correctamente")
      .urgent,
    true,
  );
});

test("desconectar invalida una lectura de Outlook todavía en curso", async () => {
  let finish;
  const monitor = new MailMonitor(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    classifyMail,
  );
  monitor.enabled = true;
  const pending = monitor.sync();
  monitor.disconnect();
  finish({
    messages: [{ subject: "Urgente", body: "Paquete perdido", importance: 2 }],
  });
  assert.equal(await pending, false);
  assert.equal(monitor.enabled, false);
  assert.deepEqual(monitor.messages, []);
});

test("un fallo de Outlook retira la caché para no avisar sobre datos antiguos", async () => {
  const monitor = new MailMonitor(async () => {
    throw Error("Sin conexión");
  }, classifyMail);
  monitor.messages = [{ subject: "Antiguo" }];
  await assert.rejects(monitor.sync(), /Sin conexión/);
  assert.deepEqual(monitor.messages, []);
  assert.equal(monitor.busy, false);
});
