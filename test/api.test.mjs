import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("API real + SQLite temporal + servicio Ollama simulado", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "jarvis-test-"));
  let lastPrompt;
  let rejectChat = false;
  let releaseChat;
  let holdChat = false;
  const modelServer = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/tags")
      return res.end(
        JSON.stringify({
          models: [
            { name: "test:local", capabilities: ["completion"] },
            { name: "nomic-embed-text", capabilities: ["embedding"] },
            { name: "test:cloud", capabilities: ["completion"] },
          ],
        }),
      );
    let input = "";
    for await (const chunk of req) input += chunk;
    lastPrompt = JSON.parse(input);
    if (holdChat)
      await new Promise((resolve) => {
        releaseChat = resolve;
      });
    if (rejectChat) {
      res.statusCode = 500;
      return res.end('{"error":"model unavailable"}');
    }
    res.end(
      JSON.stringify({
        message: {
          content: "Según la nota «Protocolo», registra la incidencia.",
        },
      }),
    );
  });
  modelServer.listen(0, "127.0.0.1");
  await once(modelServer, "listening");
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, [path.join(root, "server.mjs")], {
      windowsHide: true,
      env: {
        ...process.env,
        JARVIS_PORT: "0",
        JARVIS_DATA_DIR: dataDir,
        JARVIS_OLLAMA: `http://127.0.0.1:${modelServer.address().port}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    base = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(Error("El servidor no arrancó en 10 segundos")),
        10000,
      );
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        reject(Error("Salida prematura: " + code));
      });
      child.stdout.on("data", (chunk) => {
        const url = chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/);
        if (url) {
          clearTimeout(timeout);
          resolve(url[0]);
        }
      });
    });
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const ended = once(child, "exit");
      child.kill();
      await ended;
    }
  }
  t.after(async () => {
    releaseChat?.();
    await stop();
    modelServer.closeAllConnections();
    await new Promise((resolve) => modelServer.close(resolve));
  });
  await start();
  async function api(route, method = "GET", body, headers = {}) {
    const response = await fetch(base + "/api" + route, {
      method,
      headers: {
        "X-Jarvis": "local",
        "Content-Type": "application/json",
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() };
  }
  let taskId;
  let backup;

  await t.test("entrega interfaz y arranca con datos vacíos", async () => {
    assert.equal((await fetch(base)).status, 200);
    assert.equal((await api("/state")).data.tasks.length, 0);
  });

  await t.test(
    "bloquea escrituras de otros orígenes y JSON no válido",
    async () => {
      assert.equal(
        (
          await api(
            "/tasks",
            "POST",
            {},
            { Origin: "https://otra-web.example" },
          )
        ).status,
        403,
      );
      assert.equal((await api("/tasks", "POST", null)).status, 400);
      const response = await fetch(base + "/api/tasks", {
        method: "POST",
        headers: { "X-Jarvis": "local" },
        body: "{",
      });
      assert.equal(response.status, 400);
    },
  );

  await t.test(
    "crea y edita tareas con tildes y texto que parece HTML",
    async () => {
      const result = await api("/tasks", "POST", {
        title: "Reunión 📦 <script>alert(1)</script>",
        due: new Date(Date.now() - 60000).toISOString(),
        priority: "alta",
      });
      assert.equal(result.status, 201);
      taskId = result.data.id;
      assert.match((await api("/state")).data.tasks[0].title, /Reunión 📦/);
      assert.equal(
        (await api("/tasks/" + taskId, "PATCH", { done: true })).status,
        200,
      );
      assert.equal((await api("/reminders")).data.alerts.length, 0);
      await api("/tasks/" + taskId, "PATCH", { done: false });
    },
  );

  await t.test(
    "acuse de aviso persiste tras reiniciar y evita duplicados",
    async () => {
      const alerts = (await api("/reminders")).data.alerts;
      assert.equal(alerts.length, 1);
      await api("/reminders/ack", "POST", { id: alerts[0].id });
      await stop();
      await start();
      assert.equal((await api("/state")).data.tasks.length, 1);
      assert.equal((await api("/reminders")).data.alerts.length, 0);
    },
  );

  await t.test(
    "filtra modelos incompatibles y guarda conversación con contexto",
    async () => {
      assert.deepEqual((await api("/models")).data.models, ["test:local"]);
      await api("/settings", "POST", { model: "test:local" });
      await api("/notes", "POST", {
        title: "Protocolo",
        body: "Si un paquete está perdido, registra una incidencia.",
      });
      const result = await api("/chat", "POST", {
        message: "¿Qué dice el protocolo sobre un paquete perdido?",
      });
      assert.equal(result.status, 200);
      assert.match(lastPrompt.messages[0].content, /registra una incidencia/);
      assert.equal((await api("/state")).data.messages.length, 2);
    },
  );

  await t.test(
    "un fallo del modelo no guarda una conversación incompleta",
    async () => {
      rejectChat = true;
      assert.equal(
        (await api("/chat", "POST", { message: "Prueba de error" })).status,
        502,
      );
      assert.equal((await api("/state")).data.messages.length, 2);
      rejectChat = false;
    },
  );

  await t.test(
    "impide dos generaciones simultáneas y vaciar durante una respuesta",
    async () => {
      holdChat = true;
      const first = api("/chat", "POST", { message: "Primera" });
      for (let i = 0; !releaseChat && i < 100; i++)
        await new Promise((resolve) => setTimeout(resolve, 10));
      assert.ok(releaseChat);
      assert.equal(
        (await api("/chat", "POST", { message: "Segunda" })).status,
        409,
      );
      assert.equal((await api("/messages", "DELETE")).status, 409);
      releaseChat();
      holdChat = false;
      assert.equal((await first).status, 200);
    },
  );

  await t.test(
    "una copia inválida no destruye los datos existentes",
    async () => {
      backup = (await api("/backup")).data;
      const corrupt = structuredClone(backup);
      corrupt.tasks[0].id = "../no-valido";
      assert.equal((await api("/restore", "POST", corrupt)).status, 400);
      assert.equal((await api("/state")).data.tasks[0].id, taskId);
    },
  );

  await t.test("restaura una copia completa y rearma sus avisos", async () => {
    await api("/tasks/" + taskId, "PATCH", { done: true });
    assert.equal((await api("/restore", "POST", backup)).status, 200);
    assert.equal((await api("/state")).data.tasks[0].done, 0);
    assert.equal((await api("/reminders")).data.alerts.length, 1);
  });

  await t.test(
    "analiza correo ficticio sin conectarse a un buzón real",
    async () => {
      const result = await api("/mail/analyze", "POST", {
        subject: "URGENTE",
        body: "El paquete se ha perdido",
      });
      assert.equal(result.data.urgent, true);
      assert.equal((await api("/mail")).data.enabled, false);
    },
  );
});
