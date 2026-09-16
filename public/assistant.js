import { JarvisCoreVisual } from "./components/core-visual.js";
import { JarvisConversation } from "./components/conversation.js";
const $ = (id) => document.getElementById(id);
let noticeTimer;
function notice(message) {
  $("noticeBanner").textContent = message;
  $("noticeBanner").hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => ($("noticeBanner").hidden = true), 9000);
}
const core = new JarvisCoreVisual($("jarvisCoreCanvas"));
const conversation = new JarvisConversation({
  onStateChange(state) {
    document.body.dataset.state = state;
    $("stateText").textContent = state.toUpperCase();
    core.setState(state);
    const listening = state === "Escuchando";
    $("micToggleBtn").setAttribute("aria-pressed", String(listening));
    $("micBtnLabel").textContent = listening
      ? "Detener escucha"
      : "Pulsar para hablar";
    $("btnSendText").disabled = [
      "Pensando",
      "Transcribiendo",
      "Escuchando",
    ].includes(state);
  },
  onTranscriptUpdate({ userText, jarvisText }) {
    if (userText !== undefined) $("userText").textContent = userText;
    if (jarvisText !== undefined) $("jarvisText").textContent = jarvisText;
  },
  onNotification: notice,
});
if (!conversation.recognition) {
  $("micToggleBtn").disabled = true;
  $("micBtnLabel").textContent = "Voz no disponible";
  $("voiceHint").textContent =
    "El reconocimiento de voz no está disponible en este entorno. Puedes escribir.";
}
$("micToggleBtn").addEventListener("click", () => conversation.toggleVoice());
$("textCommandForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (conversation.isBusy || conversation.isListening) return;
  const query = $("textCommandInput").value.trim();
  if (!query) return;
  conversation.sendMessage(query);
  $("textCommandInput").value = "";
});
$("coreIntensity").addEventListener("input", (event) => {
  core.setIntensity(event.target.value / 100);
  $("intensityValue").textContent = event.target.value + "%";
});
function motionLabel() {
  document.body.dataset.motion = core.paused ? "paused" : "running";
  $("motionToggle").setAttribute("aria-pressed", String(core.paused));
  $("motionToggle").textContent = core.paused
    ? "Activar animación"
    : "Pausar animación";
}
$("motionToggle").addEventListener("click", () => {
  core.setPaused(!core.paused);
  motionLabel();
});
document.addEventListener("jarvis-motion-change", motionLabel);
motionLabel();
async function api(route) {
  const response = await fetch("/api" + route, {
    headers: { "X-Jarvis": "local" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw Error("No se pudo consultar " + route);
  return response.json();
}
const date = (value) =>
  new Date(value).toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
function item(title, detail, urgent = false) {
  const article = document.createElement("div");
  article.className = "agenda-item" + (urgent ? " urgent" : "");
  const head = document.createElement("div");
  head.className = "agenda-item-title";
  head.textContent = title;
  const sub = document.createElement("div");
  sub.className = "agenda-item-due";
  sub.textContent = detail;
  article.append(head, sub);
  return article;
}
let loading = false;
async function telemetry() {
  if (loading) return;
  loading = true;
  try {
    const state = await api("/state");
    document.body.dataset.connected = "true";
    $("connectionText").textContent = "SERVICIO LOCAL CONECTADO";
    const tasks = (state.tasks || []).filter((t) => !t.done);
    const dated = tasks
      .filter((t) => t.due && Number.isFinite(Date.parse(t.due)))
      .sort((a, b) => Date.parse(a.due) - Date.parse(b.due));
    const upcoming = dated.filter((t) => Date.parse(t.due) >= Date.now());
    const overdue = dated.length - upcoming.length;
    $("nextEventSnippet").textContent = upcoming.length
      ? date(upcoming[0].due) + " · " + upcoming[0].title
      : "Sin próximos compromisos";
    $("pendingCount").textContent = tasks.length;
    $("noteCount").textContent = (state.notes || []).length;
    $("modelName").textContent = state.model || "Sin seleccionar";
    $("modelInfoText").textContent = state.model
      ? "Modelo seleccionado: " + state.model
      : "Selecciona un modelo en el panel de gestión.";
    $("agendaPreview").replaceChildren();
    if (overdue) {
      const p = document.createElement("p");
      p.textContent = overdue + " compromiso(s) vencido(s) por revisar";
      $("agendaPreview").append(p);
    }
    for (const task of upcoming.slice(1, 3)) {
      const p = document.createElement("p");
      p.textContent = date(task.due) + " · " + task.title;
      $("agendaPreview").append(p);
    }
    $("agendaListContent").replaceChildren(
      ...tasks
        .slice(0, 30)
        .map((t) =>
          item(
            t.title,
            t.due ? date(t.due) : "Sin fecha",
            t.priority === "high",
          ),
        ),
    );
    if (!tasks.length)
      $("agendaListContent").textContent = "No hay tareas pendientes.";
  } catch {
    $("connectionText").textContent = "SIN CONEXIÓN";
    document.body.dataset.connected = "false";
    $("nextEventSnippet").textContent = "Agenda no disponible";
    $("agendaPreview").replaceChildren();
    $("pendingCount").textContent = "—";
    $("noteCount").textContent = "—";
    $("modelName").textContent = "No disponible";
    $("modelInfoText").textContent = "No se pudo consultar el modelo.";
    $("agendaListContent").textContent = "No se pudo consultar la agenda.";
  } finally {
    loading = false;
  }
}
let mailLoading = false;
async function mailTelemetry() {
  if (mailLoading) return;
  mailLoading = true;
  try {
    const mail = await api("/mail");
    if (mail.error) throw Error(mail.error);
    if (!mail.enabled) {
      $("mailSummary").textContent = "Outlook sin conectar";
      $("mailContent").textContent =
        "Puedes activar Outlook desde el panel de gestión.";
      return;
    }
    const messages = mail.messages || [];
    const urgent = messages.filter((m) => m.urgent).length;
    $("mailSummary").textContent = urgent
      ? urgent + " posible(s) urgencia(s) para revisar"
      : "Sin señales de urgencia en la última lectura";
    $("mailContent").replaceChildren(
      ...messages
        .slice(0, 15)
        .map((m) =>
          item(
            m.subject || "Sin asunto",
            (m.sender || "") + (m.urgent ? " · Posible urgencia" : ""),
            m.urgent,
          ),
        ),
    );
    if (!messages.length)
      $("mailContent").textContent = "No hay mensajes en la última lectura.";
  } catch {
    $("mailSummary").textContent = "Correo no disponible";
    $("mailContent").textContent =
      "No se pudo consultar el correo. Revisa la conexión en el panel de gestión.";
  } finally {
    mailLoading = false;
  }
}
for (const [name, refresh] of [
  ["Agenda", telemetry],
  ["Mail", mailTelemetry],
  ["Settings", telemetry],
]) {
  const modal = $(name.toLowerCase() + "Modal");
  $("btn" + name).addEventListener("click", () => {
    refresh();
    if (!modal.open) modal.showModal();
  });
  $("btnClose" + name).addEventListener("click", () => modal.close());
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      const r = modal.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        modal.close();
    }
  });
}
function clock() {
  const now = new Date();
  $("localClock").dateTime = now.toISOString();
  $("localClock").textContent =
    now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) +
    " / HORA LOCAL";
}
telemetry();
mailTelemetry();
clock();
const poll = setInterval(() => {
  if (!document.hidden) {
    telemetry();
    mailTelemetry();
    clock();
  }
}, 30000);
window.addEventListener(
  "pagehide",
  () => {
    clearInterval(poll);
    clearTimeout(noticeTimer);
    core.destroy();
    conversation.recognition?.abort();
    conversation.synth?.cancel();
  },
  { once: true },
);
