class ReminderPoller {
  constructor({ api, show, onError = () => {} }) {
    this.api = api;
    this.show = show;
    this.onError = onError;
    this.busy = false;
    this.shown = new Set();
  }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const { alerts } = await this.api("/reminders");
      for (const alert of alerts.slice(0, 1)) {
        // Si falló el acuse, reintentamos guardarlo sin volver a mostrar el aviso.
        if (!this.shown.has(alert.id)) {
          if (!(await this.show(alert))) continue;
          this.shown.add(alert.id);
        }
        await this.api("/reminders/ack", "POST", { id: alert.id });
        this.shown.delete(alert.id);
      }
    } catch (error) {
      this.onError(error);
    } finally {
      this.busy = false;
    }
  }
}
module.exports = { ReminderPoller };
