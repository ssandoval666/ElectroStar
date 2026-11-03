export type ClientRecord = {
  idclientes: string;
  nombre: string;
  apellido: string;
  telefono: string;
};

export type BudgetProduct = {
  idproducto: string;
  descripcion_producto: string;
  cantidad: number;
  valor_unitario: number;
  valor_total: number;
};

export type BudgetRecord = {
  idpresupuesto: string;
  idclientes: string;
  descripcion: string;
  fecha: string;
  productos: BudgetProduct[];
  total: number;
  fecha_modificacion: string;
  usuario_modificacion: string;
};