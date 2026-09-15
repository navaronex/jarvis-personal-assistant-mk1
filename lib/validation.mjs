/** Validación del servidor. El navegador ayuda al usuario, pero no es una barrera de confianza. */
export function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

export function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("Se esperaba un objeto JSON.");
  }
  return value;
}

export function text(value, max, label, empty = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!empty && !value.trim())
  ) {
    fail(`${label}: revisa el contenido (máximo ${max} caracteres).`);
  }
  return value.trim();
}

export function identifier(value) {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      value,
    )
  ) {
    fail("Identificador no válido.");
  }
  return value;
}

export function timestamp(value, optional = false) {
  if (optional && value === "") return value;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    fail("Fecha no válida.");
  }
  return value;
}

export function taskFields(value) {
  const task = object(value);
  const title = text(task.title, 300, "Tarea");
  const due = timestamp(task.due ?? "", true);
  if (!["normal", "alta"].includes(task.priority)) fail("Prioridad no válida.");
  return [title, due, task.priority];
}

/** Buffer evita romper una letra UTF-8 que llegue dividida entre dos paquetes de red. */
export async function readJson(request, maxBytes = 2_000_000) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes)
      fail("El archivo o mensaje es demasiado grande.", 413);
    chunks.push(chunk);
  }
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    fail("No se ha podido leer el JSON de la solicitud.");
  }
  return object(value);
}
