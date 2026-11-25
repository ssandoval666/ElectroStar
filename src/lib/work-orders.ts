import { randomUUID } from "node:crypto";
import { readJsonEntity, writeJsonEntity } from "@/lib/drive-json-store";
import type { BudgetRecord, ClientRecord } from "@/lib/budgets";

export type WorkOrderStatus = "pendiente" | "programada" | "en_curso" | "completada" | "cancelada";

export type SignaturePoint = { x: number; y: number };
export type WorkOrderSignature = {
  strokes: SignaturePoint[][];
  signedAt: string;
  signedBy: string;
};
export type WorkOrderSignatures = {
  client: WorkOrderSignature;
  responsible: WorkOrderSignature;
};

export type WorkOrder = {
  id: string;
  idpresupuesto: string;
  idclientes: string;
  descripcion: string;
  tareas: string;
  direccion: string;
  fecha_programada: string;
  usuario_asignado: string;
  estado: WorkOrderStatus;
  materiales: BudgetRecord["productos"];
  servicios?: NonNullable<BudgetRecord["servicios"]>;
  signatures?: WorkOrderSignatures;
  fecha_creacion: string;
  fecha_modificacion: string;
  usuario_modificacion: string;
};

export type WorkOrderView = WorkOrder & {
  cliente: { nombre: string; apellido: string; telefono: string } | null;
};

let pendingWorkOrderBatch: Promise<WorkOrder[]> | null = null;

async function appendMissingWorkOrders(
  budgets: BudgetRecord[],
  existingWorkOrders: WorkOrder[],
  clients: ClientRecord[],
) {
  const existingBudgetIds = new Set(existingWorkOrders.map((workOrder) => workOrder.idpresupuesto));
  const clientsById = new Map(clients.map((client) => [client.idclientes, client]));
  const missingOrders: WorkOrder[] = [];
  for (const budget of budgets) {
    if (budget.estado !== "aceptado" || existingBudgetIds.has(budget.idpresupuesto)) continue;
    existingBudgetIds.add(budget.idpresupuesto);
    missingOrders.push(createWorkOrderForBudget(
      budget,
      budget.usuario_modificacion,
      clientsById.get(budget.idclientes)?.direccion ?? "",
    ));
  }

  if (!missingOrders.length) return existingWorkOrders;

  const workOrders = [...existingWorkOrders, ...missingOrders];
  await writeJsonEntity("ordenes-trabajo.json", workOrders);
  return workOrders;
}

function createWorkOrderForBudget(budget: BudgetRecord, userId: string, address: string): WorkOrder {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    idpresupuesto: budget.idpresupuesto,
    idclientes: budget.idclientes,
    descripcion: budget.descripcion,
    tareas: budget.descripcion,
    direccion: address,
    fecha_programada: "",
    usuario_asignado: "",
    estado: "pendiente",
    materiales: budget.productos.map((item) => ({ ...item })),
    servicios: (budget.servicios ?? []).map((item) => ({ ...item })),
    fecha_creacion: now,
    fecha_modificacion: now,
    usuario_modificacion: userId,
  };
}

export async function ensureWorkOrderForBudget(budget: BudgetRecord, userId: string, address = "") {
  const items = await readJsonEntity<WorkOrder[]>("ordenes-trabajo.json", async () => []);
  const existing = items.find((item) => item.idpresupuesto === budget.idpresupuesto);
  if (existing) return existing;

  const workOrder = createWorkOrderForBudget(budget, userId, address);
  await writeJsonEntity("ordenes-trabajo.json", [...items, workOrder]);
  return workOrder;
}

export async function ensureWorkOrdersForBudgets(
  budgets: BudgetRecord[],
  existingWorkOrders: WorkOrder[],
  clients: ClientRecord[],
): Promise<WorkOrder[]> {
  if (pendingWorkOrderBatch) {
    return appendMissingWorkOrders(budgets, await pendingWorkOrderBatch, clients);
  }

  const batch = appendMissingWorkOrders(budgets, existingWorkOrders, clients);
  pendingWorkOrderBatch = batch;

  try {
    return await batch;
  } finally {
    if (pendingWorkOrderBatch === batch) pendingWorkOrderBatch = null;
  }
}
