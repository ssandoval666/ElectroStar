import { getAdminSessionUser } from "@/lib/session";
import { getServiceStore, normalizeServiceName, normalizeServiceUnit, parseServiceFields, writeServiceStore, type ServiceRecord } from "@/lib/services";
import { readJsonEntity } from "@/lib/drive-json-store";
import type { BudgetRecord } from "@/lib/budgets";
import type { WorkOrder } from "@/lib/work-orders";

type RouteContext = { params: Promise<{ idservicio: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const admin = await getAdminSessionUser();
  if (!admin) return Response.json({ message: "No autorizado." }, { status: 403 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ message: "El cuerpo de la solicitud no es válido." }, { status: 400 });
  }
  const fields = parseServiceFields(payload);
  if (!fields) return Response.json({ message: "Ingresá descripción, categoría, unidad y un valor válido." }, { status: 400 });

  try {
    const { idservicio } = await params;
    const store = await getServiceStore();
    const index = store.servicios.findIndex((service) => service.idservicio === idservicio);
    if (index < 0) return Response.json({ message: "Servicio no encontrado." }, { status: 404 });
    if (store.servicios.some((service) =>
      service.idservicio !== idservicio &&
      normalizeServiceName(service.descripcion) === normalizeServiceName(fields.descripcion) &&
      normalizeServiceUnit(service.unidad) === normalizeServiceUnit(fields.unidad),
    )) {
      return Response.json({ message: "Ya existe un servicio con esa descripción y unidad." }, { status: 409 });
    }

    const current = store.servicios[index];
    const priceChanged = current.Valor !== fields.Valor;
    const updated: ServiceRecord = {
      ...current,
      ...fields,
      fecha_modificacion: new Date().toISOString(),
      usuario_modificacion: admin.idusuario,
      historial: priceChanged
        ? [...current.historial, {
            valorAnterior: current.Valor,
            valorNuevo: fields.Valor,
            fecha: new Date().toISOString(),
            usuario: admin.idusuario,
            fuente: "manual",
          }]
        : current.historial,
    };
    store.servicios[index] = updated;
    await writeServiceStore(store);
    return Response.json({ service: updated });
  } catch (error) {
    console.error("Service update error:", error);
    return Response.json({ message: "No se pudo actualizar el servicio." }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const admin = await getAdminSessionUser();
  if (!admin) return Response.json({ message: "No autorizado." }, { status: 403 });

  try {
    const { idservicio } = await params;
    const store = await getServiceStore();
    const service = store.servicios.find((item) => item.idservicio === idservicio);
    if (!service) return Response.json({ message: "Servicio no encontrado." }, { status: 404 });
    const [budgets, workOrders] = await Promise.all([
      readJsonEntity<BudgetRecord[]>("presupuestos.json", async () => []),
      readJsonEntity<WorkOrder[]>("ordenes-trabajo.json", async () => []),
    ]);
    const inBudget = budgets.some((budget) => budget.servicios?.some((line) => line.idservicio === idservicio));
    const inWorkOrder = workOrders.some((workOrder) => workOrder.servicios?.some((line) => line.idservicio === idservicio));
    if (inBudget || inWorkOrder) {
      return Response.json({ message: "No se puede eliminar el servicio porque está asociado a presupuestos u órdenes de trabajo." }, { status: 409 });
    }
    store.servicios = store.servicios.filter((item) => item.idservicio !== idservicio);
    await writeServiceStore(store);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Service delete error:", error);
    return Response.json({ message: "No se pudo eliminar el servicio." }, { status: 503 });
  }
}
