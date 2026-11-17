import { randomUUID } from "node:crypto";
import { readJsonEntity, writeJsonEntity } from "@/lib/drive-json-store";

export type ServicePriceHistory = {
  valorAnterior: number;
  valorNuevo: number;
  fecha: string;
  usuario: string;
  fuente: string;
  documento?: string;
};

export type ServiceRecord = {
  idservicio: string;
  descripcion: string;
  categoria: string;
  unidad: string;
  Valor: number;
  fecha_modificacion: string;
  usuario_modificacion: string;
  historial: ServicePriceHistory[];
};

export type ServiceProposal = {
  id: string;
  clave: string;
  descripcion: string;
  categoria: string;
  unidad: string;
  Valor: number;
  pagina: number;
  estado: "pendiente" | "aprobada" | "descartada";
  servicioCoincidente: string | null;
  fechaCreacion: string;
};

export type ServiceSourceStatus = {
  ultimaVerificacion: string | null;
  hashDocumento: string | null;
  fechaDocumento: string | null;
  url: string | null;
};

export type ServiceStore = {
  version: 1;
  servicios: ServiceRecord[];
  propuestas: ServiceProposal[];
  fuente: ServiceSourceStatus;
};

export const emptyServiceStore: ServiceStore = {
  version: 1,
  servicios: [],
  propuestas: [],
  fuente: {
    ultimaVerificacion: null,
    hashDocumento: null,
    fechaDocumento: null,
    url: null,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateServiceStore(value: unknown): value is ServiceStore {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.servicios) || !Array.isArray(value.propuestas) || !isRecord(value.fuente)) return false;
  const source = value.fuente;
  if (
    (source.ultimaVerificacion !== null && typeof source.ultimaVerificacion !== "string") ||
    (source.hashDocumento !== null && typeof source.hashDocumento !== "string") ||
    (source.fechaDocumento !== null && typeof source.fechaDocumento !== "string") ||
    (source.url !== null && typeof source.url !== "string")
  ) return false;
  return value.servicios.every((item) =>
    isRecord(item) &&
    typeof item.idservicio === "string" &&
    typeof item.descripcion === "string" &&
    typeof item.categoria === "string" &&
    typeof item.unidad === "string" &&
    typeof item.Valor === "number" &&
    Number.isFinite(item.Valor) &&
    Array.isArray(item.historial),
  ) && value.propuestas.every((item) =>
    isRecord(item) &&
    typeof item.id === "string" &&
    typeof item.clave === "string" &&
    typeof item.descripcion === "string" &&
    typeof item.categoria === "string" &&
    typeof item.unidad === "string" &&
    typeof item.Valor === "number" &&
    Number.isFinite(item.Valor) &&
    typeof item.pagina === "number" &&
    ["pendiente", "aprobada", "descartada"].includes(String(item.estado)) &&
    (item.servicioCoincidente === null || typeof item.servicioCoincidente === "string"),
  );
}

export async function getServiceStore(): Promise<ServiceStore> {
  const value = await readJsonEntity<unknown>("servicios.json", async () => structuredClone(emptyServiceStore));
  if (Array.isArray(value) && value.length === 0) {
    const store = structuredClone(emptyServiceStore);
    await writeServiceStore(store);
    return store;
  }
  if (!validateServiceStore(value)) throw new Error("servicios.json contiene datos no válidos.");
  return value;
}

export async function writeServiceStore(store: ServiceStore): Promise<void> {
  await writeJsonEntity("servicios.json", store);
}

export function parseServiceFields(value: unknown) {
  if (!isRecord(value)) return null;
  const descripcion = typeof value.descripcion === "string" ? value.descripcion.trim() : "";
  const categoria = typeof value.categoria === "string" ? value.categoria.trim() : "";
  const unidad = typeof value.unidad === "string" ? value.unidad.trim() : "";
  const Valor = typeof value.Valor === "number" ? value.Valor : Number.NaN;
  if (
    !descripcion || descripcion.length > 160 ||
    !categoria || categoria.length > 80 ||
    !unidad || unidad.length > 240 ||
    !Number.isFinite(Valor) || Valor < 0
  ) return null;
  return { descripcion, categoria, unidad, Valor };
}

export function createServiceRecord(
  fields: NonNullable<ReturnType<typeof parseServiceFields>>,
  userId: string,
): ServiceRecord {
  return {
    idservicio: randomUUID(),
    ...fields,
    fecha_modificacion: new Date().toISOString(),
    usuario_modificacion: userId,
    historial: [],
  };
}

export function normalizeServiceName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function normalizeServiceUnit(value: string) {
  const withComparableOperators = value
    .replace(/<=/g, " menor o igual que ")
    .replace(/>=/g, " mayor o igual que ")
    .replace(/</g, " menor que ")
    .replace(/>/g, " mayor que ");
  return normalizeServiceName(withComparableOperators);
}
