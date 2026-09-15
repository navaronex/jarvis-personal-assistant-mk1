/**
 * Conversation and Speech Controller for J.A.R.V.I.S.
 * Manages audio recognition, TTS voice playback, and communication with backend /api/chat.
 */

export class JarvisConversation {
  constructor({ onStateChange, onTranscriptUpdate, onNotification }) {
    this.onStateChange = onStateChange || (() => {});
    this.onTranscriptUpdate = onTranscriptUpdate || (() => {});
    this.onNotification = onNotification || (() => {});

    this.state = "Preparado";
    this.isListening = false;
    this.isBusy = false;
    this.recognition = null;
    this.synth = window.speechSynthesis || null;

    this.initSpeechRecognition();
  }

  setState(newState) {
    this.state = newState;
    this.onStateChange(newState);
  }

  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.info("Reconocimiento de voz no soportado directamente en este motor de navegador; se usa entrada por texto.");
      return;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.lang = "es-ES";
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.maxAlternatives = 1;

      this.recognition.onstart = () => {
        this.isListening = true;
        this.setState("Escuchando");
      };

      this.recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript) {
          this.setState("Transcribiendo");
          this.onTranscriptUpdate({ userText: transcript });
          this.sendMessage(transcript);
        }
      };

      this.recognition.onerror = (event) => {
        this.isListening = false;
        console.warn("Speech recognition warning:", event.error);
        if (event.error !== "no-speech") {
          this.onNotification("Micrófono: " + (event.error || "error desconocido"));
        }
        this.setState("Preparado");
      };

      this.recognition.onend = () => {
        this.isListening = false;
        if (this.state === "Escuchando") {
          this.setState("Preparado");
        }
      };
    } catch (e) {
      console.warn("No se pudo iniciar el servicio de voz:", e);
    }
  }

  toggleVoice() {
    if (!this.recognition) {
      this.onNotification("Reconocimiento de voz no disponible en este entorno. Utilice el campo de texto.");
      return;
    }

    if (this.isListening) {
      try {
        this.recognition.stop();
      } catch {}
      this.isListening = false;
      this.setState("Preparado");
    } else {
      if (this.isBusy) return;
      try {
        this.recognition.start();
      } catch (err) {
        console.warn("No se pudo arrancar el micrófono:", err);
        this.setState("Preparado");
      }
    }
  }

  async sendMessage(rawText) {
    const message = (rawText || "").trim();
    if (!message || this.isBusy) return;

    this.isBusy = true;
    this.onTranscriptUpdate({ userText: message, jarvisText: "Procesando su solicitud..." });
    this.setState("Pensando");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Jarvis": "local",
        },
        body: JSON.stringify({ message }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = data.error || "No se pudo procesar la solicitud.";
        this.onTranscriptUpdate({
          jarvisText: `Aviso del sistema: ${errorMsg}`,
        });
        this.onNotification(errorMsg);
        this.setState("Preparado");
        return;
      }

      const answer = data.answer || "Comando procesado correctamente, señor.";
      this.onTranscriptUpdate({ jarvisText: answer });
      this.speak(answer);

    } catch (err) {
      const errText = "No se pudo conectar con el núcleo de Jarvis en server.mjs.";
      this.onTranscriptUpdate({ jarvisText: errText });
      this.onNotification(errText);
      this.setState("Preparado");
    } finally {
      this.isBusy = false;
    }
  }

  speak(text) {
    if (!this.synth) {
      this.setState("Preparado");
      return;
    }

    try {
      this.synth.cancel();
      // Clean markdown symbols for cleaner voice speech
      const cleanText = text.replace(/[*_#`~[\]()<>]/g, " ").slice(0, 400);
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = "es-ES";
      utterance.rate = 1.05;
      utterance.pitch = 0.95;

      utterance.onstart = () => {
        this.setState("Hablando");
      };

      utterance.onend = () => {
        this.setState("Preparado");
      };

      utterance.onerror = () => {
        this.setState("Preparado");
      };

      this.synth.speak(utterance);
    } catch (e) {
      console.warn("Speech synthesis error:", e);
      this.setState("Preparado");
    }
  }
}
