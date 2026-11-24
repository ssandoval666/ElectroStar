export type ClientRecord = {
  idclientes: string;
  nombre: string;
  apellido: string;
  telefono: string;
  direccion?: string;
};

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