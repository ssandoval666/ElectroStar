import { getAdminSessionUser } from "@/lib/session";
import { createServiceRecord, getServiceStore, normalizeServiceName, normalizeServiceUnit, parseServiceFields, writeServiceStore } from "@/lib/services";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const admin = await getAdminSessionUser();
  if (!admin) return Response.json({ message: "No autorizado." }, { status: 403 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ message: "El cuerpo de la solicitud no es válido." }, { status: 400 });
  }
  if (!payload || typeof payload !== "object" || !("accion" in payload)) {
    return Response.json({ message: "La decisión sobre la propuesta no es válida." }, { status: 400 });
  }

  try {
    const { id } = await params;
    const store = await getServiceStore();
    const proposal = store.propuestas.find((item) => item.id === id);
    if (!proposal) return Response.json({ message: "Propuesta no encontrada." }, { status: 404 });
    if (proposal.estado !== "pendiente") return Response.json({ message: "La propuesta ya fue revisada." }, { status: 409 });
    const action = payload.accion;
    if (action === "descartar") {
      proposal.estado = "descartada";
      await writeServiceStore(store);
      return Response.json({ proposal });
    }
    if (action !== "aprobar") return Response.json({ message: "La decisión sobre la propuesta no es válida." }, { status: 400 });

    const targetId = "idservicio" in payload && typeof payload.idservicio === "string" ? payload.idservicio : "";
    if (targetId) {
      const service = store.servicios.find((item) => item.idservicio === targetId);
      if (!service) return Response.json({ message: "El servicio seleccionado no existe." }, { status: 400 });
      if (service.Valor !== proposal.Valor) {
        const now = new Date().toISOString();
        service.historial.push({
          valorAnterior: service.Valor,
          valorNuevo: proposal.Valor,
          fecha: now,
          usuario: admin.idusuario,
          fuente: "AAIERIC",
          documento: store.fuente.fechaDocumento ?? undefined,
        });
        service.Valor = proposal.Valor;
        service.fecha_modificacion = now;
        service.usuario_modificacion = admin.idusuario;
      }
      proposal.servicioCoincidente = service.idservicio;
    } else {
      const fields = parseServiceFields({
        descripcion: "descripcion" in payload ? payload.descripcion : proposal.descripcion,
        categoria: "categoria" in payload ? payload.categoria : proposal.categoria,
        unidad: "unidad" in payload ? payload.unidad : proposal.unidad,
        Valor: proposal.Valor,
      });
      if (!fields) return Response.json({ message: "Revisá la descripción, categoría y unidad del nuevo servicio." }, { status: 400 });
      const duplicate = store.servicios.find((service) =>
        normalizeServiceName(service.descripcion) === normalizeServiceName(fields.descripcion) &&
        normalizeServiceUnit(service.unidad) === normalizeServiceUnit(fields.unidad),
      );
      if (duplicate) return Response.json({ message: "Ya existe un servicio con esa descripción y unidad; seleccioná ese servicio para actualizar su valor." }, { status: 409 });
      const service = createServiceRecord(fields, admin.idusuario);
      service.historial.push({
        valorAnterior: 0,
        valorNuevo: fields.Valor,
        fecha: service.fecha_modificacion,
        usuario: admin.idusuario,
        fuente: "AAIERIC",
        documento: store.fuente.fechaDocumento ?? undefined,
      });
      store.servicios.push(service);
      proposal.servicioCoincidente = service.idservicio;
    }

    proposal.estado = "aprobada";
    await writeServiceStore(store);
    return Response.json({ proposal });
  } catch (error) {
    console.error("AAIERIC proposal review error:", error);
    return Response.json({ message: "No se pudo guardar la revisión del servicio." }, { status: 503 });
  }
}
