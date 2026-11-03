import { getCurrentSessionUser } from "@/lib/session";
import { readJsonEntity, writeJsonEntity } from "@/lib/drive-json-store";
import type { CalendarEntry } from "@/lib/calendar";

type RouteContext = { params: Promise<{ id: string }> };

function parseEntry(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;

  const entry = payload as Partial<CalendarEntry>;
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

export async function PUT(request: Request, context: RouteContext) {
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
    const { id } = await context.params;
    const items = await readJsonEntity<CalendarEntry[]>("calendario.json", async () => []);
    const index = items.findIndex((entry) => entry.id === id);
    if (index < 0) return Response.json({ message: "La actividad no existe." }, { status: 404 });
    const entry = { ...items[index], ...input };
    items[index] = entry;
    await writeJsonEntity("calendario.json", items);
    return Response.json({ entry });
  } catch (error) {
    console.error("Calendar update error:", error);
    return Response.json({ message: "No se pudo actualizar la actividad." }, { status: 503 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getCurrentSessionUser();
  if (!user) return Response.json({ message: "Sesión no válida." }, { status: 401 });

  try {
    const { id } = await context.params;
    const items = await readJsonEntity<CalendarEntry[]>("calendario.json", async () => []);
    const remaining = items.filter((entry) => entry.id !== id);
    if (remaining.length === items.length) return Response.json({ message: "La actividad no existe." }, { status: 404 });
    await writeJsonEntity("calendario.json", remaining);
    return Response.json({ success: true });
  } catch (error) {
    console.error("Calendar delete error:", error);
    return Response.json({ message: "No se pudo eliminar la actividad." }, { status: 503 });
  }
}