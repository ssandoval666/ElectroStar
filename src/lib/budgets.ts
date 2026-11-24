export type ClientRecord = {
  idclientes: string;
  nombre: string;
  apellido: string;
  telefono: string;
  direccion?: string;
};

export type ClientInput = Omit<ClientRecord, "idclientes">;

export function parseClientFields(payload: unknown): ClientInput | null {
  if (!payload || typeof payload !== "object") return null;

  const client = payload as Partial<ClientInput>;
  const nombre = typeof client.nombre === "string" ? client.nombre.trim() : "";
  const apellido = typeof client.apellido === "string" ? client.apellido.trim() : "";
  const telefono = typeof client.telefono === "string" ? client.telefono.trim() : "";
  const direccion = typeof client.direccion === "string" ? client.direccion.trim() : "";

  if (!nombre || nombre.length > 80 || !apellido || apellido.length > 80 || !telefono || telefono.length > 40 || direccion.length > 240) return null;
  return { nombre, apellido, telefono, ...(direccion ? { direccion } : {}) };
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