import { getAdminSessionUser } from "@/lib/session";
import { readJsonEntity, writeJsonEntity } from "@/lib/drive-json-store";
import type { BudgetRecord } from "@/lib/budgets";
import { createBudgetUpdate } from "@/lib/budgets-api";
import { ensureWorkOrderForBudget } from "@/lib/work-orders";

type RouteContext = { params: Promise<{ idpresupuesto: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const admin = await getAdminSessionUser();
  if (!admin) return Response.json({ message: "No autorizado." }, { status: 403 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ message: "El cuerpo de la solicitud no es válido." }, { status: 400 });
  }

  const { idpresupuesto } = await params;
  try {
    const { input, productos } = await createBudgetUpdate(payload);
    if (!input) return Response.json({ message: "Completá cliente, descripción, fecha y al menos un producto con cantidad válida." }, { status: 400 });
    if (!productos) return Response.json({ message: "Uno de los productos seleccionados ya no existe." }, { status: 400 });

    const clients = await readJsonEntity<{ idclientes: string }[]>("clientes.json", async () => []);
    if (!clients.some((client) => client.idclientes === input.idclientes)) {
      return Response.json({ message: "El cliente seleccionado no existe." }, { status: 400 });
    }

    const budgets = await readJsonEntity<BudgetRecord[]>("presupuestos.json", async () => []);
    const index = budgets.findIndex((budget) => budget.idpresupuesto === idpresupuesto);
    if (index < 0) return Response.json({ message: "Presupuesto no encontrado." }, { status: 404 });
    if (budgets[index].estado === "aceptado") {
      return Response.json({ message: "Un presupuesto aceptado no se puede modificar; creá uno nuevo para una revisión." }, { status: 409 });
    }

    const budget: BudgetRecord = {
      ...budgets[index],
      idclientes: input.idclientes,
      descripcion: input.descripcion,
      fecha: input.fecha,
      productos,
      total: Math.round(productos.reduce((sum, item) => sum + item.valor_total, 0) * 100) / 100,
      estado: input.estado ?? budgets[index].estado ?? "borrador",
      ...(input.vigente_hasta !== undefined
        ? input.vigente_hasta ? { vigente_hasta: input.vigente_hasta } : {}
        : budgets[index].vigente_hasta ? { vigente_hasta: budgets[index].vigente_hasta } : {}),
      fecha_modificacion: new Date().toISOString(),
      usuario_modificacion: admin.idusuario,
    };
    budgets[index] = budget;
    await writeJsonEntity("presupuestos.json", budgets);
    if (budget.estado === "aceptado") await ensureWorkOrderForBudget(budget, admin.idusuario);
    return Response.json({ budget });
  } catch (error) {
    console.error("Budget update error:", error);
    return Response.json({ message: "No se pudo actualizar el presupuesto." }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const admin = await getAdminSessionUser();
  if (!admin) return Response.json({ message: "No autorizado." }, { status: 403 });

  try {
    const { idpresupuesto } = await params;
    const budgets = await readJsonEntity<BudgetRecord[]>("presupuestos.json", async () => []);
    const workOrders = await readJsonEntity<{ idpresupuesto: string }[]>("ordenes-trabajo.json", async () => []);
    if (workOrders.some((workOrder) => workOrder.idpresupuesto === idpresupuesto)) {
      return Response.json({ message: "No se puede eliminar un presupuesto con una orden de trabajo asociada." }, { status: 409 });
    }
    const remaining = budgets.filter((budget) => budget.idpresupuesto !== idpresupuesto);
    if (remaining.length === budgets.length) return Response.json({ message: "Presupuesto no encontrado." }, { status: 404 });
    await writeJsonEntity("presupuestos.json", remaining);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Budget delete error:", error);
    return Response.json({ message: "No se pudo eliminar el presupuesto." }, { status: 503 });
  }
}