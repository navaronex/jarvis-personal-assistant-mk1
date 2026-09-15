const $ = (s) => document.querySelector(s);
let state = { tasks: [], notes: [], messages: [], model: "" },
  filter = "pending",
  busy = false,
  noticeTimer;
function notify(message) {
  const dialog = document.querySelector("dialog[open]");
  if (dialog) {
    let alert = dialog.querySelector(".dialog-error");
    if (!alert) {
      alert = el("p", "dialog-error");
      alert.setAttribute("role", "alert");
      dialog.append(alert);
    }
    alert.textContent = message;
  }
  $("#notice").textContent = message;
  $("#notice").hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => ($("#notice").hidden = true), 12000);
}
async function api(url, method = "GET", data) {
  let r;
  try {
    r = await fetch("/api" + url, {
      method,
      headers: { "Content-Type": "application/json", "X-Jarvis": "local" },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  } catch {
    throw Error("Jarvis se ha detenido. Abre de nuevo Iniciar Jarvis.");
  }
  const b = await r.json();
  if (!r.ok) throw Error(b.error || "No se pudo completar la operación.");
  return b;
}
const guard =
  (fn) =>
  async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      notify(e.message);
    }
  };
function page(name) {
  if (!["today", "tasks", "chat", "notes", "settings", "mail"].includes(name))
    name = "today";
  document
    .querySelectorAll(".page")
    .forEach((el) => (el.hidden = el.id !== name));
  document
    .querySelectorAll("[data-page]")
    .forEach((el) => el.classList.toggle("active", el.dataset.page === name));
  history.replaceState(null, "", "#" + name);
  if (name === "chat") $("#prompt").focus();
}
function el(tag, cls, content) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (content !== undefined) n.textContent = content;
  return n;
}
function button(label, fn, cls = "link") {
  const b = el("button", cls, label);
  b.type = "button";
  b.addEventListener("click", guard(fn));
  return b;
}
const day = (d) => new Date(d).toLocaleDateString("sv-SE");
const format = (d) =>
  new Date(d).toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
function taskRow(t) {
  const row = el("div", "task" + (t.done ? " done" : ""));
  const check = el("input");
  check.type = "checkbox";
  check.checked = !!t.done;
  check.setAttribute(
    "aria-label",
    `Marcar ${t.title} como ${t.done ? "pendiente" : "completada"}`,
  );
  check.addEventListener(
    "change",
    guard(async () => {
      check.disabled = true;
      try {
        await api("/tasks/" + t.id, "PATCH", { done: check.checked });
        await refresh();
      } catch (e) {
        check.checked = !!t.done;
        throw e;
      } finally {
        check.disabled = false;
      }
    }),
  );
  const main = el("div", "task-main");
  main.append(el("span", "task-title", t.title));
  const meta = el("div", "task-meta");
  meta.append(
    el(
      "span",
      !t.done && t.due && new Date(t.due) < new Date() ? "overdue" : "",
      t.due ? format(t.due) : "Sin fecha",
    ),
  );
  if (t.priority === "alta") meta.append(el("span", "badge", "Prioridad alta"));
  main.append(meta);
  row.append(
    check,
    main,
    button("Editar", () => openTask(t)),
  );
  return row;
}
function listTasks(target, tasks, empty) {
  target.replaceChildren();
  if (!tasks.length) target.append(el("div", "empty", empty));
  else tasks.forEach((t) => target.append(taskRow(t)));
}
function render() {
  const today = day(new Date());
  const pending = state.tasks.filter((t) => !t.done);
  $("#count-today").textContent = pending.filter(
    (t) => t.due && day(t.due) === today,
  ).length;
  $("#count-overdue").textContent = pending.filter(
    (t) => t.due && new Date(t.due) < new Date(),
  ).length;
  $("#count-done").textContent = state.tasks.filter((t) => t.done).length;
  listTasks(
    $("#today-list"),
    pending.filter((t) => t.due && day(t.due) <= today),
    "Tu agenda de hoy está despejada. Añade una reunión o un compromiso para verlo aquí.",
  );
  listTasks(
    $("#task-list"),
    state.tasks.filter(
      (t) => filter === "all" || (filter === "done" ? t.done : !t.done),
    ),
    "No hay tareas en esta vista.",
  );
  renderNotes();
  renderMessages();
}
function renderNotes() {
  const q = $("#search-notes").value.toLocaleLowerCase("es");
  const list = $("#note-list");
  list.replaceChildren();
  const notes = state.notes.filter((n) =>
    (n.title + " " + n.body).toLocaleLowerCase("es").includes(q),
  );
  if (!notes.length)
    list.append(
      el(
        "div",
        "empty",
        "Guarda aquí información de clientes, procedimientos o proyectos.",
      ),
    );
  for (const n of notes) {
    const card = el("article", "panel note-card");
    card.append(el("h2", "", n.title), el("p", "", n.body.slice(0, 500)));
    const actions = el("div", "actions");
    actions.append(
      button("Abrir / editar", () => openNote(n)),
      button("Eliminar", async () => {
        if (confirm("¿Eliminar esta nota?")) {
          await api("/notes/" + n.id, "DELETE");
          await refresh();
        }
      }),
    );
    card.append(actions);
    list.append(card);
  }
}
function renderMessages() {
  const box = $("#messages");
  box.replaceChildren();
  if (!state.messages.length)
    box.append(
      el(
        "div",
        "empty",
        "Puedes empezar con «Ayúdame a planificar mi día» o «Prepara un mensaje de seguimiento».",
      ),
    );
  for (const m of state.messages) {
    const card = el("article", "message " + m.role);
    card.append(
      el("strong", "", m.role === "user" ? "Tú" : "Jarvis"),
      el("p", "", m.content),
    );
    if (m.role === "assistant")
      card.append(
        button("Guardar como nota", () =>
          openNote({ title: "Respuesta de Jarvis", body: m.content }),
        ),
      );
    box.append(card);
  }
  box.scrollTop = box.scrollHeight;
}
async function refresh() {
  state = await api("/state");
  render();
}
function openTask(t = {}) {
  document.querySelectorAll(".dialog-error").forEach((n) => n.remove());
  $("#task-form").reset();
  $("#task-id").value = t.id || "";
  $("#task-heading").textContent = t.id
    ? "Editar tarea"
    : "Nueva tarea o compromiso";
  $("#task-title").value = t.title || "";
  $("#task-priority").value = t.priority || "normal";
  if (t.due) {
    const d = new Date(t.due);
    $("#task-due").value = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  }
  $("#task-dialog").showModal();
  $("#task-title").focus();
}
function openNote(n = {}) {
  document.querySelectorAll(".dialog-error").forEach((n) => n.remove());
  $("#note-form").reset();
  $("#note-id").value = n.id || "";
  $("#note-heading").textContent = n.id ? "Editar nota" : "Nueva nota";
  $("#note-title").value = n.title || "";
  $("#note-body").value = n.body || "";
  $("#note-dialog").showModal();
}
async function models() {
  const select = $("#model");
  const help = $("#model-help");
  help.textContent = "Comprobando…";
  try {
    const b = await api("/models");
    select.replaceChildren();
    select.append(new Option("Selecciona un modelo", ""));
    for (const m of b.models) select.append(new Option(m, m));
    select.value = state.model;
    if (!select.value && b.models.length)
      select.value = b.models.includes("qwen2.5:7b")
        ? "qwen2.5:7b"
        : b.models[0];
    $("#connection").textContent = b.models.length
      ? "● IA local disponible"
      : "Sin modelo de conversación";
    help.textContent = b.models.length
      ? "Conexión disponible. Guarda el modelo para utilizarlo."
      : "No hay modelos de conversación. Usa Preparar IA local en la carpeta de Jarvis.";
  } catch (e) {
    $("#connection").textContent = "IA sin conexión";
    help.textContent = e.message;
  }
}
$("#date").textContent = new Date().toLocaleDateString("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
document
  .querySelectorAll("[data-page]")
  .forEach((b) => (b.onclick = () => page(b.dataset.page)));
document
  .querySelectorAll("[data-go]")
  .forEach((b) => (b.onclick = () => page(b.dataset.go)));
document
  .querySelectorAll("[data-close]")
  .forEach((b) => (b.onclick = () => $("#" + b.dataset.close).close()));
document.querySelectorAll("[data-filter]").forEach(
  (b) =>
    (b.onclick = () => {
      filter = b.dataset.filter;
      document
        .querySelectorAll("[data-filter]")
        .forEach((n) => n.classList.toggle("selected", n === b));
      render();
    }),
);
$("#new-task").onclick = () => openTask();
$("#new-today").onclick = () => openTask();
$("#new-note").onclick = () => openNote();
$("#search-notes").oninput = renderNotes;
$("#task-form").onsubmit = guard(async (e) => {
  e.preventDefault();
  const b = e.submitter;
  b.disabled = true;
  try {
    const id = $("#task-id").value;
    await api("/tasks" + (id ? "/" + id : ""), id ? "PATCH" : "POST", {
      title: $("#task-title").value,
      due: $("#task-due").value
        ? new Date($("#task-due").value).toISOString()
        : "",
      priority: $("#task-priority").value,
    });
    $("#task-dialog").close();
    await refresh();
    notify(
      $("#task-due").value
        ? "Guardado. Jarvis avisará a su hora y 15 minutos antes si sigue en marcha y el PC está activo."
        : "Tarea guardada sin fecha de aviso.",
    );
  } finally {
    b.disabled = false;
  }
});
$("#note-form").onsubmit = guard(async (e) => {
  e.preventDefault();
  const b = e.submitter;
  b.disabled = true;
  try {
    const id = $("#note-id").value;
    await api("/notes" + (id ? "/" + id : ""), id ? "PATCH" : "POST", {
      title: $("#note-title").value,
      body: $("#note-body").value,
    });
    $("#note-dialog").close();
    await refresh();
    notify("Nota guardada.");
  } finally {
    b.disabled = false;
  }
});
$("#chat-form").onsubmit = guard(async (e) => {
  e.preventDefault();
  if (busy) return;
  const message = $("#prompt").value.trim();
  if (!message) return;
  busy = true;
  $("#send").disabled = true;
  $("#prompt").readOnly = true;
  $("#chat-state").textContent =
    "Jarvis está pensando… El primer mensaje puede tardar unos minutos.";
  try {
    await api("/chat", "POST", { message });
    $("#prompt").value = "";
    await refresh();
  } finally {
    busy = false;
    $("#send").disabled = false;
    $("#prompt").readOnly = false;
    $("#chat-state").textContent =
      "La IA puede equivocarse. Revisa fechas y datos.";
  }
});
$("#plan-day").onclick = () => {
  page("chat");
  $("#prompt").value =
    "Ayúdame a planificar el día según mis tareas pendientes. Señala compromisos con fecha, vencidos y próximos pasos. No inventes plazos.";
};
$("#clear-chat").onclick = guard(async () => {
  if (confirm("¿Vaciar la conversación? Tus notas y tareas se conservan.")) {
    await api("/messages", "DELETE");
    await refresh();
  }
});
$("#refresh-models").onclick = guard(models);
$("#save-model").onclick = guard(async () => {
  await api("/settings", "POST", { model: $("#model").value });
  await refresh();
  notify("Modelo guardado. Ya puedes conversar.");
});
$("#import-note").onclick = () => $("#note-file").click();
$("#note-file").onchange = guard(async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  if (!/\.(md|txt)$/i.test(file.name) || file.size > 180000)
    throw Error("Elige un archivo .md o .txt de hasta 180 KB.");
  const body = await file.text();
  if (body.length > 60000)
    throw Error("La nota supera 60.000 caracteres. Divídela en varias notas.");
  openNote({ title: file.name.slice(0, 200), body });
});
$("#restore").onclick = () => $("#backup-file").click();
$("#backup-file").onchange = guard(async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  if (file.size > 50000000)
    throw Error("La copia supera el tamaño admitido de 50 MB.");
  let b;
  try {
    b = JSON.parse(await file.text());
  } catch {
    throw Error("El archivo no es una copia JSON válida.");
  }
  if (
    !confirm(
      "Se sustituirán tus tareas, notas y conversaciones y se reactivarán sus avisos. ¿Has descargado una copia y quieres continuar?",
    )
  )
    return;
  await api("/restore", "POST", b);
  await refresh();
  await models();
  notify("Copia restaurada.");
});
$("#notifications").onclick = guard(async () => {
  if (!("Notification" in window))
    throw Error(
      "Este navegador no admite avisos. Los avisos de Windows se gestionan desde el iniciador.",
    );
  const permission = await Notification.requestPermission();
  notify(
    permission === "granted"
      ? "Avisos del navegador activados."
      : "Permiso no concedido. Los vencimientos siguen visibles en Mi día.",
  );
});
const alerted = new Set();
setInterval(
  guard(async () => {
    if (busy) return;
    const fresh = await api("/state");
    state.tasks = fresh.tasks;
    render();
    for (const t of state.tasks) {
      if (
        t.done ||
        !t.due ||
        new Date(t.due) > new Date() ||
        alerted.has(t.id + "|" + t.due)
      )
        continue;
      alerted.add(t.id + "|" + t.due);
      if (
        !window.jarvisDesktop &&
        "Notification" in window &&
        Notification.permission === "granted"
      )
        new Notification("Jarvis · Compromiso pendiente", {
          body: t.title + " · " + format(t.due),
          tag: t.id,
        });
    }
  }),
  30000,
);
void guard(async () => {
  await refresh();
  page(location.hash.slice(1) || "today");
  await models();
})();
async function mailRefresh() {
  const data = await api("/mail");
  $("#mail-status").textContent =
    data.error ||
    (data.enabled
      ? "Lectura activada. Última comprobación: " +
        (data.checked ? format(data.checked) : "pendiente")
      : "Lectura desactivada.");
  const list = $("#mail-list");
  list.replaceChildren();
  for (const m of data.messages) {
    const card = el("article", "panel note-card");
    card.append(
      el("span", "badge", m.urgent ? "Posible urgencia" : "Revisar"),
      el("h2", "", m.subject || "(Sin asunto)"),
      el("p", "", m.sender + " · " + format(m.received)),
      el(
        "p",
        "",
        m.reasons.join(" · ") || "Sin señales de urgencia detectadas.",
      ),
    );
    card.append(
      button("Abrir texto", () => {
        $("#mail-subject").value = m.subject;
        $("#mail-body").value = m.body;
        $("#mail-body").scrollIntoView({ behavior: "smooth" });
      }),
    );
    list.append(card);
  }
}
$("#connect-mail").onclick = guard(async () => {
  if (
    !confirm(
      "¿Autorizar a Jarvis a leer la bandeja de entrada del perfil abierto en Outlook clásico en ESTE PC? No envía ni modifica correos.",
    )
  )
    return;
  $("#mail-status").textContent = "Conectando con Outlook…";
  try {
    await api("/mail/connect", "POST", {});
    notify(
      "Lectura activada. Se comprobará cada 5 minutos mientras Jarvis esté en marcha.",
    );
  } finally {
    await mailRefresh();
  }
});
$("#check-mail").onclick = guard(async () => {
  $("#mail-status").textContent = "Comprobando…";
  try {
    await api("/mail/check", "POST", {});
  } finally {
    await mailRefresh();
  }
});
$("#disconnect-mail").onclick = guard(async () => {
  await api("/mail/disconnect", "POST", {});
  await mailRefresh();
  notify("Lectura desactivada.");
});
$("#mail-form").onsubmit = guard(async (e) => {
  e.preventDefault();
  const b = await api("/mail/analyze", "POST", {
    subject: $("#mail-subject").value,
    body: $("#mail-body").value,
  });
  $("#mail-analysis").replaceChildren(
    el(
      "h3",
      "",
      b.urgent ? "Posible urgencia: revísalo pronto" : "Revisión del mensaje",
    ),
    el(
      "p",
      "",
      b.reasons.join(". ") ||
        "No se han detectado expresiones de urgencia. Esto no garantiza que el mensaje no sea importante.",
    ),
    el(
      "p",
      "caption",
      "Detección por expresiones del texto; comprueba negaciones, fechas y si la incidencia ya se resolvió.",
    ),
  );
});
$("#mail-task").onclick = () =>
  openTask({
    title: (
      "Revisar: " + ($("#mail-subject").value || "correo pendiente")
    ).slice(0, 300),
    priority: "alta",
  });
$("#read-mail").onclick = guard(async () => {
  if (!("speechSynthesis" in window))
    throw Error("La lectura en voz alta no está disponible.");
  const voice = speechSynthesis
    .getVoices()
    .find((v) => v.localService && v.lang.startsWith("es"));
  if (!voice)
    throw Error(
      "No hay una voz local en español disponible en este navegador.",
    );
  const content = $("#mail-body").value.trim();
  if (!content) throw Error("Pega o abre primero un correo.");
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(
    ($("#mail-subject").value + ". " + content).slice(0, 12000),
  );
  utterance.voice = voice;
  utterance.lang = voice.lang;
  speechSynthesis.speak(utterance);
});
$("#stop-voice").onclick = () => window.speechSynthesis?.cancel();
void guard(mailRefresh)();
setInterval(() => {
  if (!$("#mail").hidden) void guard(mailRefresh)();
}, 30000);
