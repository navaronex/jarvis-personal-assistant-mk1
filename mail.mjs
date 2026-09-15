import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
const exec = promisify(execFile);
export function classifyMail(subject, body, importance = 1) {
  const raw = (subject + " " + body)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const rules = [
    [
      /\b(perdid[oa]s?|extraviad[oa]s?|no localizado|desaparecid[oa])\b/,
      "Posible paquete perdido o extraviado",
    ],
    [
      /\b(urgente|urgencia|inmediata|inmediato)\b/,
      "El mensaje menciona urgencia",
    ],
    [
      /\b(reclamacion|incidencia|retraso|danad[oa]|roto|rotura)\b/,
      "Posible incidencia de entrega",
    ],
    [/\b(hoy|antes de las|vence|plazo limite)\b/, "Menciona un plazo cercano"],
  ];
  const reasons = rules.filter(([re]) => re.test(raw)).map(([, r]) => r);
  if (importance === 2)
    reasons.push("El remitente lo marcó con importancia alta");
  return {
    urgent:
      importance === 2 ||
      reasons.some((r) => /perdido|urgencia/.test(r)) ||
      reasons.length >= 2,
    reasons,
    label: reasons.length ? "Revisar contexto" : "Sin señales detectadas",
  };
}
export async function readOutlook(root) {
  if (process.platform !== "win32")
    throw Error("La lectura local de Outlook necesita Windows.");
  try {
    const { stdout } = await exec(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.join(root, "Leer Outlook.ps1"),
      ],
      {
        windowsHide: true,
        timeout: 60000,
        maxBuffer: 3000000,
        encoding: "utf8",
      },
    );
    const result = JSON.parse(stdout.replace(/^\uFEFF/, ""));
    if (result.error) throw Error(result.error);
    return result;
  } catch (e) {
    throw Error(
      e.message.includes("Outlook")
        ? e.message
        : "No se pudo leer Outlook clásico. Ábrelo con el perfil correcto y revisa si solicita permiso. El nuevo Outlook requiere una conexión distinta.",
    );
  }
}
