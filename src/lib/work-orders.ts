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
  fecha_creacion: string;
  fecha_modificacion: string;
  usuario_modificacion: string;
};

export type WorkOrderView = WorkOrder & {
  cliente: { nombre: string; apellido: string; telefono: string } | null;
};

export async function ensureWorkOrderForBudget(budget: BudgetRecord, userId: string) {
  const items = await readJsonEntity<WorkOrder[]>("ordenes-trabajo.json", async () => []);
  const existing = items.find((item) => item.idpresupuesto === budget.idpresupuesto);
  if (existing) return existing;

  const now = new Date().toISOString();
  const workOrder: WorkOrder = {
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
    fecha_creacion: now,
    fecha_modificacion: now,
    usuario_modificacion: userId,
  };
  await writeJsonEntity("ordenes-trabajo.json", [...items, workOrder]);
  return workOrder;
}
