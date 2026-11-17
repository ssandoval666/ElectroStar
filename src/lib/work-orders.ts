import { randomUUID } from "node:crypto";
import { readJsonEntity, writeJsonEntity } from "@/lib/drive-json-store";
import type { BudgetRecord } from "@/lib/budgets";

export type WorkOrderStatus = "pendiente" | "programada" | "en_curso" | "completada" | "cancelada";

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
  fecha_creacion: string;
  fecha_modificacion: string;
  usuario_modificacion: string;
};

export type WorkOrderView = WorkOrder & {
  cliente: { nombre: string; apellido: string; telefono: string } | null;
};

let pendingWorkOrderBatch: Promise<WorkOrder[]> | null = null;

async function appendMissingWorkOrders(budgets: BudgetRecord[], existingWorkOrders: WorkOrder[]) {
  const existingBudgetIds = new Set(existingWorkOrders.map((workOrder) => workOrder.idpresupuesto));
  const missingOrders: WorkOrder[] = [];
  for (const budget of budgets) {
    if (budget.estado !== "aceptado" || existingBudgetIds.has(budget.idpresupuesto)) continue;
    existingBudgetIds.add(budget.idpresupuesto);
    missingOrders.push(createWorkOrderForBudget(budget, budget.usuario_modificacion));
  }

  if (!missingOrders.length) return existingWorkOrders;

  const workOrders = [...existingWorkOrders, ...missingOrders];
  await writeJsonEntity("ordenes-trabajo.json", workOrders);
  return workOrders;
}

function createWorkOrderForBudget(budget: BudgetRecord, userId: string): WorkOrder {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    idpresupuesto: budget.idpresupuesto,
    idclientes: budget.idclientes,
    descripcion: budget.descripcion,
    tareas: budget.descripcion,
    direccion: "",
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

export async function ensureWorkOrderForBudget(budget: BudgetRecord, userId: string) {
  const items = await readJsonEntity<WorkOrder[]>("ordenes-trabajo.json", async () => []);
  const existing = items.find((item) => item.idpresupuesto === budget.idpresupuesto);
  if (existing) return existing;

  const workOrder = createWorkOrderForBudget(budget, userId);
  await writeJsonEntity("ordenes-trabajo.json", [...items, workOrder]);
  return workOrder;
}

export async function ensureWorkOrdersForBudgets(
  budgets: BudgetRecord[],
  existingWorkOrders: WorkOrder[],
): Promise<WorkOrder[]> {
  if (pendingWorkOrderBatch) {
    return appendMissingWorkOrders(budgets, await pendingWorkOrderBatch);
  }

  const batch = appendMissingWorkOrders(budgets, existingWorkOrders);
  pendingWorkOrderBatch = batch;

  try {
    return await batch;
  } finally {
    if (pendingWorkOrderBatch === batch) pendingWorkOrderBatch = null;
  }
}
