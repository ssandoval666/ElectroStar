import { readJsonEntity } from "@/lib/drive-json-store";
import type { BudgetRecord } from "@/lib/budgets";
import type { WorkOrder } from "@/lib/work-orders";

export type ProductReferences = {
  budgets: Array<{ id: string; descripcion: string; fecha: string }>;
  workOrders: Array<{ id: string; descripcion: string; fecha_programada: string; estado: string }>;
  stock: Array<{ idproducto: string; cantidad: number }>;
};

export async function getProductReferences(idproducto: string): Promise<ProductReferences> {
  const [budgets, workOrders, stock] = await Promise.all([
    readJsonEntity<BudgetRecord[]>("presupuestos.json", async () => []),
    readJsonEntity<WorkOrder[]>("ordenes-trabajo.json", async () => []),
    readJsonEntity<Array<{ idproducto: string; cantidad: number }>>("stock.json", async () => []),
  ]);

  return {
    budgets: budgets
      .filter((budget) =>
        Array.isArray(budget.productos) &&
        budget.productos.some((product) => product?.idproducto === idproducto)
      )
      .map((budget) => ({
        id: budget.idpresupuesto,
        descripcion: budget.descripcion,
        fecha: budget.fecha,
      })),
    workOrders: workOrders
      .filter((workOrder) =>
        Array.isArray(workOrder.materiales) &&
        workOrder.materiales.some((material) => material?.idproducto === idproducto)
      )
      .map((workOrder) => ({
        id: workOrder.id,
        descripcion: workOrder.descripcion,
        fecha_programada: workOrder.fecha_programada,
        estado: workOrder.estado,
      })),
    stock: stock.filter((item) => item.idproducto === idproducto),
  };
}
