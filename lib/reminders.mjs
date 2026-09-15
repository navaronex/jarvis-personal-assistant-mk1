/** Función pura: recibe el tiempo para poder probar el límite exacto de 15 minutos. */
export function taskReminder(task, time) {
  if (task.done || !task.due) return null;
  const due = Date.parse(task.due);
  if (!Number.isFinite(due) || due - time > 15 * 60 * 1000) return null;
  const phase = time >= due ? "due" : "soon";
  return {
    id: `${task.id}|${task.due}|${phase}`,
    title:
      phase === "soon"
        ? "Compromiso en menos de 15 minutos"
        : "Compromiso pendiente",
    body: task.title,
  };
}
