import { JarvisCoreVisual } from "./components/core-visual.js";
import { JarvisConversation } from "./components/conversation.js";

document.addEventListener("DOMContentLoaded", () => {
  // UI Elements
  const stateText = document.getElementById("stateText");
  const userText = document.getElementById("userText");
  const jarvisText = document.getElementById("jarvisText");
  const micBtn = document.getElementById("micToggleBtn");
  const micBtnLabel = document.getElementById("micBtnLabel");
  const canvas = document.getElementById("jarvisCoreCanvas");
  const textForm = document.getElementById("textCommandForm");
  const textInput = document.getElementById("textCommandInput");
  const nextEventSnippet = document.getElementById("nextEventSnippet");
  const noticeBanner = document.getElementById("noticeBanner");

  // Modals & Triggers
  const btnAgenda = document.getElementById("btnAgenda");
  const agendaModal = document.getElementById("agendaModal");
  const btnCloseAgenda = document.getElementById("btnCloseAgenda");
  const agendaListContent = document.getElementById("agendaListContent");

  const btnMail = document.getElementById("btnMail");
  const mailModal = document.getElementById("mailModal");
  const btnCloseMail = document.getElementById("btnCloseMail");
  const mailContent = document.getElementById("mailContent");

  const btnSettings = document.getElementById("btnSettings");
  const settingsModal = document.getElementById("settingsModal");
  const btnCloseSettings = document.getElementById("btnCloseSettings");
  const modelInfoText = document.getElementById("modelInfoText");

  let noticeTimer;
  function showNotification(msg) {
    if (!noticeBanner) return;
    noticeBanner.textContent = msg;
    noticeBanner.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      noticeBanner.hidden = true;
    }, 8000);
  }

  // 1. Initialize Arc Reactor Core Visualizer
  const coreVisual = new JarvisCoreVisual(canvas);

  // 2. Initialize Conversation Controller
  const conversation = new JarvisConversation({
    onStateChange: (newState) => {
      stateText.textContent = newState.toUpperCase();
      coreVisual.setState(newState);

      if (newState === "Escuchando") {
        micBtn.classList.add("active-listening");
        micBtnLabel.textContent = "ESCUCHANDO...";
      } else {
        micBtn.classList.remove("active-listening");
        micBtnLabel.textContent = "PULSAR PARA HABLAR";
      }
    },
    onTranscriptUpdate: ({ userText: uText, jarvisText: jText }) => {
      if (uText) userText.textContent = `« ${uText} »`;
      if (jText) jarvisText.textContent = jText;
    },
    onNotification: (msg) => {
      showNotification(msg);
    },
  });

  // 3. Voice Toggle Interactions
  micBtn.addEventListener("click", () => conversation.toggleVoice());
  canvas.addEventListener("click", () => conversation.toggleVoice());

  // 4. Text Command Submission
  textForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const query = textInput.value.trim();
    if (!query) return;
    textInput.value = "";
    conversation.sendMessage(query);
  });

  // 5. Telemetry & Agenda Synchronization
  async function loadTelemetry() {
    try {
      const res = await fetch("/api/state", {
        headers: { "X-Jarvis": "local" },
      });
      if (!res.ok) throw new Error("Error obteniendo estado");
      const state = await res.json();

      // Find next task with a due date
      const pendingTasks = (state.tasks || []).filter((t) => !t.done);
      const withDue = pendingTasks
        .filter((t) => t.due && t.due.trim().length > 0)
        .sort((a, b) => new Date(a.due) - new Date(b.due));

      if (withDue.length > 0) {
        const next = withDue[0];
        const dueDate = new Date(next.due);
        const timeStr = dueDate.toLocaleTimeString("es-ES", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const dateStr = dueDate.toLocaleDateString("es-ES", {
          day: "numeric",
          month: "short",
        });
        nextEventSnippet.textContent = `${dateStr} ${timeStr} · ${next.title}`;
      } else if (pendingTasks.length > 0) {
        nextEventSnippet.textContent = `${pendingTasks.length} tarea(s) pendiente(s)`;
      } else {
        nextEventSnippet.textContent = "Sin compromisos pendientes";
      }

      // Populate Agenda Modal
      renderAgendaModal(pendingTasks);

      // Populate Settings Model info
      if (modelInfoText) {
        modelInfoText.textContent = state.model
          ? `Modelo actual: ${state.model}`
          : "Sin modelo seleccionado (configure uno en el Panel de Gestión)";
      }
    } catch (err) {
      nextEventSnippet.textContent = "Sistemas operativos";
      agendaListContent.innerHTML = '<p class="empty-tip">No se pudo sincronizar la agenda.</p>';
    }
  }

  function renderAgendaModal(tasks) {
    if (!tasks || tasks.length === 0) {
      agendaListContent.innerHTML = '<p class="empty-tip">No hay compromisos ni tareas pendientes hoy.</p>';
      return;
    }

    agendaListContent.innerHTML = tasks.slice(0, 15).map((t) => {
      let dueLabel = "Sin fecha límite";
      if (t.due) {
        const d = new Date(t.due);
        dueLabel = `${d.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} ${d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
      }
      return `
        <div class="agenda-item ${t.priority === "high" ? "urgent" : ""}">
          <div>
            <div class="agenda-item-title">${escapeHtml(t.title)}</div>
          </div>
          <div class="agenda-item-due">${dueLabel}</div>
        </div>
      `;
    }).join("");
  }

  async function loadMailTelemetry() {
    try {
      const res = await fetch("/api/mail", {
        headers: { "X-Jarvis": "local" },
      });
      if (!res.ok) throw new Error("Error obteniendo correo");
      const mail = await res.json();
      
      if (!mail.enabled) {
        mailContent.innerHTML = `
          <p class="empty-tip">La integración con Outlook está desactivada.</p>
          <p>Puede activarla en el Panel de Gestión en la sección de Correo.</p>
        `;
        return;
      }

      const msgs = mail.messages || [];
      if (msgs.length === 0) {
        mailContent.innerHTML = '<p class="empty-tip">No hay mensajes recientes en la bandeja de entrada.</p>';
        return;
      }

      mailContent.innerHTML = msgs.slice(0, 10).map((m) => `
        <div class="agenda-item ${m.urgent ? "urgent" : ""}">
          <div>
            <div class="agenda-item-title">${escapeHtml(m.subject || "Sin asunto")}</div>
            <div style="font-size: 0.85rem; color: var(--text-muted);">${escapeHtml(m.from || "")}</div>
          </div>
          <div class="agenda-item-due">${m.unread ? "NO LEÍDO" : "LEÍDO"}</div>
        </div>
      `).join("");
    } catch (err) {
      mailContent.innerHTML = '<p class="empty-tip">No se pudo conectar con el servicio de correo.</p>';
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  // Agenda modal triggers
  btnAgenda?.addEventListener("click", () => {
    loadTelemetry();
    agendaModal?.showModal();
  });
  btnCloseAgenda?.addEventListener("click", () => agendaModal?.close());

  // Mail modal triggers
  btnMail?.addEventListener("click", () => {
    loadMailTelemetry();
    mailModal?.showModal();
  });
  btnCloseMail?.addEventListener("click", () => mailModal?.close());

  // Settings modal triggers
  btnSettings?.addEventListener("click", () => {
    loadTelemetry();
    settingsModal?.showModal();
  });
  btnCloseSettings?.addEventListener("click", () => settingsModal?.close());

  // Close modals on clicking outside box
  [agendaModal, mailModal, settingsModal].forEach((m) => {
    m?.addEventListener("click", (e) => {
      if (e.target === m) m.close();
    });
  });

  // Initial telemetry load
  loadTelemetry();
});
