/** El número de generación invalida respuestas antiguas sin depender de su orden de llegada. */
export class MailMonitor {
  constructor(read, classify) {
    this.read = read;
    this.classify = classify;
    this.enabled = false;
    this.generation = 0;
    this.busy = false;
    this.messages = [];
    this.checked = "";
    this.error = "";
  }

  disconnect() {
    this.enabled = false;
    this.generation += 1;
    this.messages = [];
    this.checked = "";
    this.error = "";
  }

  async sync() {
    if (this.busy)
      throw Object.assign(new Error("Ya se está comprobando Outlook."), {
        status: 409,
      });
    const generation = this.generation;
    this.busy = true;
    try {
      const data = await this.read();
      if (generation !== this.generation) return false;
      this.messages = data.messages.map((mail) => ({
        ...mail,
        ...this.classify(mail.subject, mail.body, mail.importance),
      }));
      this.checked = new Date().toISOString();
      this.error = "";
      return true;
    } catch (error) {
      if (generation !== this.generation) return false;
      this.messages = [];
      this.error = error.message;
      throw error;
    } finally {
      this.busy = false;
    }
  }
}
