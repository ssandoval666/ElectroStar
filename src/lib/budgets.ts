export type ClientRecord = {
  idclientes: string;
  nombre: string;
  apellido: string;
  telefono: string;
  direccion?: string;
  cuit_cuil?: string;
  observaciones?: string;
};

export type ClientInput = Omit<ClientRecord, "idclientes">;

export function formatCuitCuil(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 10) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}

export function parseClientFields(payload: unknown): ClientInput | null {
  if (!payload || typeof payload !== "object") return null;

  const client = payload as Partial<ClientInput>;
  const nombre = typeof client.nombre === "string" ? client.nombre.trim() : "";
  const apellido = typeof client.apellido === "string" ? client.apellido.trim() : "";
  const telefono = typeof client.telefono === "string" ? client.telefono.trim() : "";
  const direccion = typeof client.direccion === "string" ? client.direccion.trim() : "";
  const rawTaxId = typeof client.cuit_cuil === "string" ? client.cuit_cuil.trim() : "";
  const taxId = rawTaxId.replace(/-/g, "");
  const observaciones = typeof client.observaciones === "string" ? client.observaciones.trim() : "";

  if (
    !nombre || nombre.length > 80 ||
    !apellido || apellido.length > 80 ||
    !telefono || telefono.length > 40 ||
    direccion.length > 240 ||
    (client.cuit_cuil !== undefined && typeof client.cuit_cuil !== "string") ||
    (rawTaxId !== "" && (!/^\d{11}$/.test(taxId) || !/^(?:\d{11}|\d{2}-\d{8}-\d)$/.test(rawTaxId))) ||
    (client.observaciones !== undefined && typeof client.observaciones !== "string") ||
    observaciones.length > 2000
  ) return null;
  return {
    nombre,
    apellido,
    telefono,
    ...(direccion ? { direccion } : {}),
    ...(taxId ? { cuit_cuil: taxId } : {}),
    ...(observaciones ? { observaciones } : {}),
  };
}

export type BudgetProduct = {
  idproducto: string;
  descripcion_producto: string;
  cantidad: number;
  valor_unitario: number;
  valor_total: number;
};

export type BudgetService = {
  idservicio: string;
  descripcion_servicio: string;
  unidad_servicio: string;
  cantidad: number;
  valor_unitario: number;
  valor_total: number;
};

export type BudgetStatus = "borrador" | "enviado" | "aceptado" | "rechazado";

export type BudgetRecord = {
  idpresupuesto: string;
  idclientes: string;
  descripcion: string;
  fecha: string;
  productos: BudgetProduct[];
  servicios?: BudgetService[];
  total: number;
  estado?: BudgetStatus;
  vigente_hasta?: string;
  fecha_modificacion: string;
  usuario_modificacion: string;
};