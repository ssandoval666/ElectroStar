import { getCurrentSessionUser } from "@/lib/session";
import { readJsonEntity } from "@/lib/drive-json-store";
import type { ClientRecord } from "@/lib/budgets";
import { ensureWorkOrdersForBudgets, type WorkOrder, type WorkOrderView } from "@/lib/work-orders";
import type { BudgetRecord } from "@/lib/budgets";

export async function GET() {
  const user = await getCurrentSessionUser();
  if (!user) return Response.json({ message: "Sesión no válida." }, { status: 401 });

  try {
    const [budgets, clients, storedWorkOrders] = await Promise.all([
      readJsonEntity<BudgetRecord[]>("presupuestos.json", async () => []),
      readJsonEntity<ClientRecord[]>("clientes.json", async () => []),
      readJsonEntity<WorkOrder[]>("ordenes-trabajo.json", async () => []),
    ]);
    const workOrders = await ensureWorkOrdersForBudgets(budgets, storedWorkOrders, clients);
    const visibleOrders = user.perfil === "Admin"
      ? workOrders
      : workOrders.filter((workOrder) => workOrder.usuario_asignado === user.idusuario);
    const clientsById = new Map(clients.map((client) => [client.idclientes, client]));
    const items: WorkOrderView[] = visibleOrders.map((workOrder) => {
      const client = clientsById.get(workOrder.idclientes);
      return {
        ...workOrder,
        cliente: client ? { nombre: client.nombre, apellido: client.apellido, telefono: client.telefono } : null,
      };
    });
    return Response.json({ items });
  } catch (error) {
    console.error("Work orders read error:", error);
    return Response.json({ message: "No se pudieron leer las órdenes de trabajo." }, { status: 503 });
  }
}
