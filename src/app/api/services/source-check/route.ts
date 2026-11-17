import { randomUUID, timingSafeEqual } from "node:crypto";
import { getAdminSessionUser } from "@/lib/session";
import { defaultAAIERICUrl, extractAAIERICPrices, fetchAAIERICPdf } from "@/lib/aaieric-pdf";
import { getServiceStore, normalizeServiceName, normalizeServiceUnit, writeServiceStore } from "@/lib/services";

export const maxDuration = 120;

function isAuthorizedCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret) return false;
  const tokenBuffer = Buffer.from(token);
  const secretBuffer = Buffer.from(secret);
  return tokenBuffer.length === secretBuffer.length && timingSafeEqual(tokenBuffer, secretBuffer);
}

export async function POST(request: Request) {
  const admin = await getAdminSessionUser();
  const isCron = isAuthorizedCron(request);
  if (!admin && !isCron) return Response.json({ message: "No autorizado." }, { status: 403 });

  try {
    const store = await getServiceStore();
    const { buffer, hash, url } = await fetchAAIERICPdf();
    const checkedAt = new Date().toISOString();
    const forceComparison = new URL(request.url).searchParams.get("force") === "true";
    const documentChanged = store.fuente.hashDocumento !== hash;
    if (!documentChanged && !forceComparison) {
      store.fuente.ultimaVerificacion = checkedAt;
      store.fuente.url = url;
      await writeServiceStore(store);
      return Response.json({ changed: false, message: "El documento no cambió.", source: store.fuente });
    }

    const extracted = await extractAAIERICPrices(buffer);
    if (!extracted.items.length) throw new Error("No se pudieron extraer precios del PDF de AAIERIC.");
    const pendingByKey = new Map(store.propuestas
      .filter((proposal) => proposal.estado === "pendiente")
      .map((proposal) => [proposal.clave, proposal]));
    const newProposals = [];
    let proposalsUpdated = 0;
    for (const item of extracted.items) {
      const key = `${hash}:${item.clave}`;
      const serviceMatch = store.servicios.find((service) =>
        normalizeServiceName(service.descripcion) === normalizeServiceName(item.descripcion) &&
        normalizeServiceUnit(service.unidad) === normalizeServiceUnit(item.unidad),
      );
      const existingProposal = pendingByKey.get(key) ?? pendingByKey.get(item.clave);
      if (existingProposal) {
        Object.assign(existingProposal, item, {
          clave: key,
          servicioCoincidente: serviceMatch?.idservicio ?? null,
        });
        pendingByKey.delete(item.clave);
        pendingByKey.set(key, existingProposal);
        proposalsUpdated += 1;
        continue;
      }
      if (serviceMatch?.Valor === item.Valor) continue;
      newProposals.push({
          ...item,
          clave: key,
          id: randomUUID(),
          estado: "pendiente" as const,
          servicioCoincidente: serviceMatch?.idservicio ?? null,
          fechaCreacion: checkedAt,
      });
    }

    store.propuestas.push(...newProposals);
    store.fuente = {
      ultimaVerificacion: checkedAt,
      hashDocumento: hash,
      fechaDocumento: extracted.fechaDocumento,
      url: url || defaultAAIERICUrl,
    };
    await writeServiceStore(store);
    return Response.json({
      changed: documentChanged,
      compared: true,
      sourceDate: extracted.fechaDocumento,
      extracted: extracted.items.length,
      proposalsCreated: newProposals.length,
      proposalsUpdated,
      source: store.fuente,
    });
  } catch (error) {
    console.error("AAIERIC service source check error:", error);
    return Response.json({ message: "No se pudo verificar o procesar el documento de AAIERIC." }, { status: 503 });
  }
}
