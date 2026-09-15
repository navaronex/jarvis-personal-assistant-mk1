/** Prueba optativa contra el modelo REAL. Solo usa información ficticia y una BD temporal. */
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const data = await mkdtemp(path.join(os.tmpdir(), 'jarvis-real-'));
const child = spawn(process.execPath, [path.join(root, 'server.mjs')], {
  windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, JARVIS_PORT: '0', JARVIS_DATA_DIR: data },
});
try {
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('No arranca Jarvis')), 10000);
    child.once('error', reject);
    child.stdout.on('data', chunk => {
      const found = chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/);
      if (found) { clearTimeout(timer); resolve(found[0]); }
    });
  });
  async function request(route, value) {
    const response = await fetch(base + '/api' + route, {
      method: value ? 'POST' : 'GET', headers: { 'X-Jarvis': 'local', 'Content-Type': 'application/json' },
      ...(value ? { body: JSON.stringify(value) } : {}), signal: AbortSignal.timeout(200000),
    });
    const body = await response.json();
    if (!response.ok) throw Error(body.error);
    return body;
  }
  const { models } = await request('/models');
  const model = process.argv[2] || models.find(name => name === 'qwen2.5:7b') || models[0];
  if (!model) throw Error('No hay un modelo local de conversación.');
  await request('/settings', { model });
  await request('/notes', { title: 'Protocolo de prueba', body: 'El código ficticio de incidencias de paquetería es AZUL-73.' });
  const started = Date.now();
  const { answer } = await request('/chat', { message: 'Según la nota Protocolo de prueba, ¿cuál es el código ficticio de incidencias? Responde en una frase y cita la nota.' });
  assert.ok(answer.includes('AZUL-73'), 'El modelo no recuperó el dato de prueba');
  assert.equal((await request('/state')).messages.length, 2);
  console.log(JSON.stringify({ model, seconds: Math.round((Date.now() - started) / 1000), answer, verified: true }, null, 2));
} finally {
  const ended = once(child, 'exit'); child.kill(); await ended;
}
