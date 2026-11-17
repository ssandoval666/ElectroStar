import { getAdminSessionUser } from "@/lib/session";
import {
  createServiceRecord,
  getServiceStore,
  normalizeServiceName,
  normalizeServiceUnit,
  parseServiceFields,
  writeServiceStore,
} from "@/lib/services";

type ApprovalInput = {
  id: string;
  idservicio: string;
  descripcion: string;
  categoria: string;
  unidad: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    return Response.json({ message: "La lista de propuestas no es válida." }, { status: 400 });
  }

  const inputs: ApprovalInput[] = [];
  for (const item of payload.items) {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.idservicio !== "string" ||
      typeof item.descripcion !== "string" ||
      typeof item.categoria !== "string" ||
      typeof item.unidad !== "string"
    ) {
      return Response.json({ message: "Una o más propuestas contienen datos no válidos." }, { status: 400 });
    }
    inputs.push({
      id: item.id,
      idservicio: item.idservicio,
      descripcion: item.descripcion,
      categoria: item.categoria,
      unidad: item.unidad,
    });
  }

  try {
    const store = await getServiceStore();
    const pending = store.propuestas.filter((proposal) => proposal.estado === "pendiente");
    const inputById = new Map<string, ApprovalInput>();
    const duplicateInputIds = new Set<string>();
    for (const input of inputs) {
      if (inputById.has(input.id)) duplicateInputIds.add(input.id);
      inputById.set(input.id, input);
    }

    type Candidate = {
      input: ApprovalInput;
      proposal: (typeof pending)[number];
      serviceId?: string;
      fields?: NonNullable<ReturnType<typeof parseServiceFields>>;
      groupKey?: string;
    };
    const candidates: Candidate[] = [];
    const skipped = new Map<string, { id: string; descripcion: string; reason: string }>();
    const skip = (proposal: (typeof pending)[number], reason: string) => {
      skipped.set(proposal.id, { id: proposal.id, descripcion: proposal.descripcion, reason });
    };

    for (const proposal of pending) {
      const input = inputById.get(proposal.id);
      if (duplicateInputIds.has(proposal.id)) {
        skip(proposal, "La propuesta está duplicada en la solicitud; revisala manualmente.");
      } else if (!input) {
        skip(proposal, "No se recibieron los datos de esta propuesta; actualizá la consulta y revisala manualmente.");
      } else if (input.idservicio) {
        const service = store.servicios.find((item) => item.idservicio === input.idservicio);
        if (!service) {
          skip(proposal, "El servicio seleccionado ya no existe; elegí otro servicio manualmente.");
        } else {
          candidates.push({ input, proposal, serviceId: service.idservicio });
        }
      } else {
        const fields = parseServiceFields({
          descripcion: input.descripcion,
          categoria: input.categoria,
          unidad: input.unidad,
          Valor: proposal.Valor,
        });
        if (!fields) {
          skip(proposal, "La descripción, categoría o unidad no es válida; corregila manualmente.");
          continue;
        }
        const matchingService = store.servicios.find((service) =>
          normalizeServiceName(service.descripcion) === normalizeServiceName(fields.descripcion) &&
          normalizeServiceUnit(service.unidad) === normalizeServiceUnit(fields.unidad),
        );
        if (matchingService) {
          skip(proposal, `Coincide con «${matchingService.descripcion}»; seleccioná ese servicio para confirmar la actualización.`);
          continue;
        }
        const groupKey = `${normalizeServiceName(fields.descripcion)}:${normalizeServiceUnit(fields.unidad)}`;
        candidates.push({ input, proposal, fields, groupKey });
      }
    }

    const selectedServiceGroups = new Map<string, Candidate[]>();
    const newServiceGroups = new Map<string, Candidate[]>();
    for (const candidate of candidates) {
      const groups = candidate.serviceId ? selectedServiceGroups : newServiceGroups;
      const key = candidate.serviceId ?? candidate.groupKey;
      if (!key) throw new Error("No se pudo determinar el destino de una propuesta.");
      groups.set(key, [...(groups.get(key) ?? []), candidate]);
    }

    for (const [serviceId, group] of selectedServiceGroups) {
      if (new Set(group.map((candidate) => candidate.proposal.Valor)).size > 1) {
        const service = store.servicios.find((item) => item.idservicio === serviceId);
        for (const candidate of group) {
          skip(candidate.proposal, `Hay varios valores propuestos para «${service?.descripcion ?? "el servicio seleccionado"}»; resolvelos manualmente.`);
        }
      }
    }
    for (const group of newServiceGroups.values()) {
      const firstFields = group[0].fields;
      if (!firstFields) throw new Error("Una propuesta nueva no contiene datos de servicio.");
      const hasConflictingValues = new Set(group.map((candidate) => candidate.proposal.Valor)).size > 1;
      const hasConflictingCategories = new Set(group.map((candidate) =>
        normalizeServiceName(candidate.fields?.categoria ?? ""),
      )).size > 1;
      if (hasConflictingValues || hasConflictingCategories) {
        for (const candidate of group) {
          skip(candidate.proposal, `Hay propuestas duplicadas con datos diferentes para «${firstFields.descripcion}»; resolvelas manualmente.`);
        }
      }
    }

    const acceptedCandidates = candidates.filter((candidate) => !skipped.has(candidate.proposal.id));
    const approvedStore = structuredClone(store);
    const now = new Date().toISOString();
    const serviceIdByProposal = new Map<string, string>();
    const acceptedServiceGroups = new Map<string, Candidate[]>();
    const acceptedNewServiceGroups = new Map<string, Candidate[]>();

    for (const candidate of acceptedCandidates) {
      const groups = candidate.serviceId ? acceptedServiceGroups : acceptedNewServiceGroups;
      const key = candidate.serviceId ?? candidate.groupKey;
      if (!key) throw new Error("No se pudo determinar el grupo de una propuesta.");
      groups.set(key, [...(groups.get(key) ?? []), candidate]);
    }

    for (const [serviceId, group] of acceptedServiceGroups) {
      const service = approvedStore.servicios.find((item) => item.idservicio === serviceId);
      if (!service) throw new Error("No se encontró un servicio durante la aprobación masiva.");
      const proposedValue = group[0].proposal.Valor;
      if (service.Valor !== proposedValue) {
        service.historial.push({
          valorAnterior: service.Valor,
          valorNuevo: proposedValue,
          fecha: now,
          usuario: admin.idusuario,
          fuente: "AAIERIC",
          documento: approvedStore.fuente.fechaDocumento ?? undefined,
        });
        service.Valor = proposedValue;
        service.fecha_modificacion = now;
        service.usuario_modificacion = admin.idusuario;
      }
      for (const candidate of group) serviceIdByProposal.set(candidate.proposal.id, serviceId);
    }

    for (const group of acceptedNewServiceGroups.values()) {
      const firstCandidate = group[0];
      const fields = firstCandidate.fields;
      if (!fields) throw new Error("Una propuesta nueva no contiene datos de servicio.");
      const service = createServiceRecord(fields, admin.idusuario);
      service.historial.push({
        valorAnterior: 0,
        valorNuevo: fields.Valor,
        fecha: now,
        usuario: admin.idusuario,
        fuente: "AAIERIC",
        documento: approvedStore.fuente.fechaDocumento ?? undefined,
      });
      approvedStore.servicios.push(service);
      for (const candidate of group) serviceIdByProposal.set(candidate.proposal.id, service.idservicio);
    }

    for (const candidate of acceptedCandidates) {
      const proposal = approvedStore.propuestas.find((item) => item.id === candidate.proposal.id);
      const serviceId = serviceIdByProposal.get(candidate.proposal.id);
      if (!proposal || !serviceId) throw new Error("No se pudo asociar una propuesta aprobada a su servicio.");
      proposal.estado = "aprobada";
      proposal.servicioCoincidente = serviceId;
    }

    if (acceptedCandidates.length > 0) await writeServiceStore(approvedStore);
    return Response.json({ approved: acceptedCandidates.length, skipped: [...skipped.values()] });
  } catch (error) {
    console.error("AAIERIC bulk proposal approval error:", error);
    return Response.json({ message: "No se pudieron aprobar todas las propuestas." }, { status: 503 });
  }
}
