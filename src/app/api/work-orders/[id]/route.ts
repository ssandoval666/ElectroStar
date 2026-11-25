import { getCurrentSessionUser } from "@/lib/session";
import { readJsonEntity, writeJsonEntity } from "@/lib/drive-json-store";
import type { ClientRecord } from "@/lib/budgets";
import { getUsers } from "@/lib/users";
import type { SignaturePoint, WorkOrder, WorkOrderSignature, WorkOrderSignatures, WorkOrderStatus } from "@/lib/work-orders";

type RouteContext = { params: Promise<{ id: string }> };
const statuses: WorkOrderStatus[] = ["pendiente", "programada", "en_curso", "completada", "cancelada"];
const operatorTransitions: Record<string, WorkOrderStatus[]> = {
  pendiente: ["programada", "en_curso"],
  programada: ["en_curso"],
  en_curso: ["completada"],
  completada: [],
  cancelada: [],
};

function isValidDate(value: string) {
  if (!value) return true;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseSignature(value: unknown): SignaturePoint[][] | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("strokes" in value) || !Array.isArray(value.strokes)) {
    return null;
  }
  const strokes = value.strokes;
  if (strokes.length < 1 || strokes.length > 20) return null;

  let totalPoints = 0;
  const parsedStrokes: SignaturePoint[][] = [];
  for (const stroke of strokes) {
    if (!Array.isArray(stroke) || stroke.length < 2 || stroke.length > 250) return null;
    const parsedStroke: SignaturePoint[] = [];
    for (const point of stroke) {
      if (!point || typeof point !== "object" || Array.isArray(point)) return null;
      const { x, y } = point as Record<string, unknown>;
      if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
        return null;
      }
      parsedStroke.push({ x, y });
    }
    totalPoints += parsedStroke.length;
    if (totalPoints > 2000) return null;
    parsedStrokes.push(parsedStroke);
  }
  return parsedStrokes;
}

function parseSignatures(value: unknown, clientName: string, responsibleName: string): WorkOrderSignatures | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const clientStrokes = parseSignature(body.client);
  const responsibleStrokes = parseSignature(body.responsible);
  if (!clientStrokes || !responsibleStrokes) return null;

  const signedAt = new Date().toISOString();
  const signature = (strokes: SignaturePoint[][], signedBy: string): WorkOrderSignature => ({
    strokes,
    signedAt,
    signedBy,
  });
  return {
    client: signature(clientStrokes, clientName),
    responsible: signature(responsibleStrokes, responsibleName),
  };
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getCurrentSessionUser();
  if (!user) return Response.json({ message: "Sesión no válida." }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ message: "El cuerpo de la solicitud no es válido." }, { status: 400 });
  }
  if (!payload || typeof payload !== "object") {
    return Response.json({ message: "El cuerpo de la solicitud no es válido." }, { status: 400 });
  }

  const { id } = await params;
  try {
    const items = await readJsonEntity<WorkOrder[]>("ordenes-trabajo.json", async () => []);
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) return Response.json({ message: "La orden de trabajo no existe." }, { status: 404 });

    const current = items[index];
    const body = payload as Record<string, unknown>;
    const estado = body.estado;
    if (!statuses.includes(estado as WorkOrderStatus)) {
      return Response.json({ message: "Seleccioná un estado válido para la orden." }, { status: 400 });
    }

    let updated: WorkOrder;
    if (user.perfil === "Admin") {
      const tareas = typeof body.tareas === "string" ? body.tareas.trim() : "";
      const direccion = typeof body.direccion === "string" ? body.direccion.trim() : "";
      const fechaProgramada = typeof body.fecha_programada === "string" ? body.fecha_programada : "";
      const usuarioAsignado = typeof body.usuario_asignado === "string" ? body.usuario_asignado : "";
      const nextStatus = estado as WorkOrderStatus;
      if (!tareas || tareas.length > 2000 || direccion.length > 240 || !isValidDate(fechaProgramada)) {
        return Response.json({ message: "Revisá las tareas, la dirección y la fecha programada." }, { status: 400 });
      }
      if (usuarioAsignado) {
        const users = await getUsers();
        if (!users.some((candidate) => candidate.idusuario === usuarioAsignado && candidate.perfil !== "Admin")) {
          return Response.json({ message: "El técnico asignado no existe o tiene un perfil de administración." }, { status: 400 });
        }
      }
      let signatures = current.signatures;
      if (nextStatus === "completada" && current.estado !== "completada") {
        const clients = await readJsonEntity<ClientRecord[]>("clientes.json", async () => []);
        const client = clients.find((candidate) => candidate.idclientes === current.idclientes);
        if (!client) return Response.json({ message: "No se encontró el cliente de la orden." }, { status: 404 });
        const signaturePayload = parseSignatures(
          body.signatures,
          `${client.nombre} ${client.apellido}`,
          [user.nombre, user.apellido].filter(Boolean).join(" ") || user.usuario,
        );
        if (!signaturePayload) {
          return Response.json({ message: "Se requieren las firmas del cliente y del responsable para completar la orden." }, { status: 400 });
        }
        signatures = signaturePayload;
      } else if (nextStatus !== "completada") {
        signatures = undefined;
      }
      updated = {
        ...current,
        tareas,
        direccion,
        fecha_programada: fechaProgramada,
        usuario_asignado: usuarioAsignado,
        estado: nextStatus,
        ...(signatures ? { signatures } : { signatures: undefined }),
      };
    } else {
      const nextStatus = estado as WorkOrderStatus;
      if (current.usuario_asignado !== user.idusuario) {
        return Response.json({ message: "Solo podés actualizar órdenes asignadas a tu usuario." }, { status: 403 });
      }
      if (!operatorTransitions[current.estado]?.includes(nextStatus)) {
        return Response.json({ message: "Ese cambio de estado no está permitido." }, { status: 400 });
      }
      let signatures = current.signatures;
      if (nextStatus === "completada") {
        const clients = await readJsonEntity<ClientRecord[]>("clientes.json", async () => []);
        const client = clients.find((candidate) => candidate.idclientes === current.idclientes);
        if (!client) return Response.json({ message: "No se encontró el cliente de la orden." }, { status: 404 });
        const signaturePayload = parseSignatures(
          body.signatures,
          `${client.nombre} ${client.apellido}`,
          [user.nombre, user.apellido].filter(Boolean).join(" ") || user.usuario,
        );
        if (!signaturePayload) {
          return Response.json({ message: "Se requieren las firmas del cliente y del responsable para completar la orden." }, { status: 400 });
        }
        signatures = signaturePayload;
      } else {
        signatures = undefined;
      }
      updated = {
        ...current,
        estado: nextStatus,
        ...(signatures ? { signatures } : { signatures: undefined }),
      };
    }

    updated.fecha_modificacion = new Date().toISOString();
    updated.usuario_modificacion = user.idusuario;
    items[index] = updated;
    await writeJsonEntity("ordenes-trabajo.json", items);
    return Response.json({ workOrder: updated });
  } catch (error) {
    console.error("Work order update error:", error);
    return Response.json({ message: "No se pudo actualizar la orden de trabajo." }, { status: 503 });
  }
}
