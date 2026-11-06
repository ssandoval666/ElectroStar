import { randomUUID } from "node:crypto";
import { getAdminSessionUser } from "@/lib/session";
import { readJsonEntity, writeJsonEntity } from "@/lib/drive-json-store";
import type { BudgetRecord, ClientRecord } from "@/lib/budgets";
import { buildBudgetProducts, parseBudget } from "@/lib/budgets-api";
import { ensureWorkOrderForBudget } from "@/lib/work-orders";

export async function GET() {
  const admin = await getAdminSessionUser();
  if (!admin) return Response.json({ message: "No autorizado." }, { status: 403 });

  try {
    const items = await readJsonEntity<BudgetRecord[]>("presupuestos.json", async () => []);
    return Response.json({ items });
  } catch (error) {
    console.error("Budgets read error:", error);
    return Response.json({ message: "No se pudo leer presupuestos.json." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const admin = await getAdminSessionUser();
  if (!admin) return Response.json({ message: "No autorizado." }, { status: 403 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ message: "El cuerpo de la solicitud no es válido." }, { status: 400 });
  }

  const input = parseBudget(payload);
  if (!input) return Response.json({ message: "Completá cliente, descripción, fecha y al menos un producto con cantidad válida." }, { status: 400 });

  try {
    const clients = await readJsonEntity<ClientRecord[]>("clientes.json", async () => []);
    if (!clients.some((client) => client.idclientes === input.idclientes)) {
      return Response.json({ message: "El cliente seleccionado no existe." }, { status: 400 });
    }
    const productos = await buildBudgetProducts(input);
    if (!productos) return Response.json({ message: "Uno de los productos seleccionados ya no existe." }, { status: 400 });

    const items = await readJsonEntity<BudgetRecord[]>("presupuestos.json", async () => []);
    const budget: BudgetRecord = {
      idpresupuesto: randomUUID(),
      idclientes: input.idclientes,
      descripcion: input.descripcion,
      fecha: input.fecha,
      productos,
      total: Math.round(productos.reduce((sum, item) => sum + item.valor_total, 0) * 100) / 100,
      estado: input.estado ?? "borrador",
      ...(input.vigente_hasta ? { vigente_hasta: input.vigente_hasta } : {}),
      fecha_modificacion: new Date().toISOString(),
      usuario_modificacion: admin.idusuario,
    };
    await writeJsonEntity("presupuestos.json", [...items, budget]);
    if (budget.estado === "aceptado") await ensureWorkOrderForBudget(budget, admin.idusuario);
    return Response.json({ budget }, { status: 201 });
  } catch (error) {
    console.error("Budget create error:", error);
    return Response.json({ message: "No se pudo guardar el presupuesto." }, { status: 503 });
  }
}