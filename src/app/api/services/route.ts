import { getAdminSessionUser } from "@/lib/session";
import { createServiceRecord, getServiceStore, normalizeServiceName, normalizeServiceUnit, parseServiceFields, writeServiceStore } from "@/lib/services";

export async function GET() {
  const admin = await getAdminSessionUser();
  if (!admin) return Response.json({ message: "No autorizado." }, { status: 403 });

  try {
    const store = await getServiceStore();
    return Response.json({ items: store.servicios, proposals: store.propuestas, source: store.fuente });
  } catch (error) {
    console.error("Services read error:", error);
    return Response.json({ message: "No se pudo leer servicios.json." }, { status: 503 });
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
  const fields = parseServiceFields(payload);
  if (!fields) return Response.json({ message: "Ingresá descripción, categoría, unidad y un valor válido." }, { status: 400 });

  try {
    const store = await getServiceStore();
    const duplicate = store.servicios.some((service) =>
      normalizeServiceName(service.descripcion) === normalizeServiceName(fields.descripcion) &&
      normalizeServiceUnit(service.unidad) === normalizeServiceUnit(fields.unidad),
    );
    if (duplicate) return Response.json({ message: "Ya existe un servicio con esa descripción y unidad." }, { status: 409 });
    const service = createServiceRecord(fields, admin.idusuario);
    store.servicios.push(service);
    await writeServiceStore(store);
    return Response.json({ service }, { status: 201 });
  } catch (error) {
    console.error("Service create error:", error);
    return Response.json({ message: "No se pudo guardar servicios.json." }, { status: 503 });
  }
}
