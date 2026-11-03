import { randomUUID } from "node:crypto";
import { getCurrentSessionUser } from "@/lib/session";
import { readJsonEntity, writeJsonEntity } from "@/lib/drive-json-store";
import type { CalendarEntry, CalendarEntryInput } from "@/lib/calendar";

function parseEntry(payload: unknown): CalendarEntryInput | null {
  if (!payload || typeof payload !== "object") return null;

  const entry = payload as Partial<CalendarEntryInput>;
  const descripcion = typeof entry.descripcion === "string" ? entry.descripcion.trim() : "";
  const fecha = typeof entry.fecha === "string" ? entry.fecha : "";
  const hora = typeof entry.hora === "string" ? entry.hora : "";
  const duracion = typeof entry.duracion === "number" ? entry.duracion : Number.NaN;

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora) ||
    !descripcion || descripcion.length > 240 ||
    !Number.isInteger(duracion) || duracion < 1 || duracion > 1440
  ) return null;

  return { fecha, hora, descripcion, duracion };
}

export async function GET() {
  const user = await getCurrentSessionUser();
  if (!user) return Response.json({ message: "Sesión no válida." }, { status: 401 });

  try {
    const items = await readJsonEntity<CalendarEntry[]>("calendario.json", async () => []);
    return Response.json({ items });
  } catch (error) {
    console.error("Calendar read error:", error);
    return Response.json({ message: "No se pudo leer calendario.json." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentSessionUser();
  if (!user) return Response.json({ message: "Sesión no válida." }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ message: "El cuerpo de la solicitud no es válido." }, { status: 400 });
  }

  const input = parseEntry(payload);
  if (!input) return Response.json({ message: "Revisá la fecha, hora, descripción y duración." }, { status: 400 });

  try {
    const items = await readJsonEntity<CalendarEntry[]>("calendario.json", async () => []);
    const entry: CalendarEntry = { id: randomUUID(), ...input, usuario_creacion: user.idusuario };
    await writeJsonEntity("calendario.json", [...items, entry]);
    return Response.json({ entry }, { status: 201 });
  } catch (error) {
    console.error("Calendar create error:", error);
    return Response.json({ message: "No se pudo guardar la actividad." }, { status: 503 });
  }
}