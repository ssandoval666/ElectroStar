import { readJsonEntity } from "@/lib/drive-json-store";
import type { BudgetProduct, BudgetService, BudgetStatus } from "@/lib/budgets";
import type { ProductRecord } from "@/app/api/products/route";
import { getServiceStore } from "@/lib/services";

export type BudgetInput = {
  idclientes: string;
  descripcion: string;
  fecha: string;
  estado?: BudgetStatus;
  vigente_hasta?: string;
  productos: Array<{ idproducto: string; cantidad: number }>;
  servicios: Array<{ idservicio: string; cantidad: number }>;
};

const budgetStatuses: BudgetStatus[] = ["borrador", "enviado", "aceptado", "rechazado"];

export function parseBudget(payload: unknown): BudgetInput | null {
  if (!payload || typeof payload !== "object") return null;

  const budget = payload as Partial<BudgetInput>;
  const idclientes = typeof budget.idclientes === "string" ? budget.idclientes : "";
  const descripcion = typeof budget.descripcion === "string" ? budget.descripcion.trim() : "";
  const fecha = typeof budget.fecha === "string" ? budget.fecha : "";
  const estado = budget.estado === undefined
    ? undefined
    : budgetStatuses.includes(budget.estado as BudgetStatus) ? budget.estado as BudgetStatus : null;
  const vigente_hasta = budget.vigente_hasta === undefined
    ? undefined
    : typeof budget.vigente_hasta === "string" ? budget.vigente_hasta : null;
  if (estado === null || vigente_hasta === null) return null;
  const validUntilParts = vigente_hasta?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const validUntilDate = validUntilParts ? new Date(`${vigente_hasta}T00:00:00.000Z`) : null;
  const validUntilIsValid = !vigente_hasta || (
    validUntilDate !== null &&
    !Number.isNaN(validUntilDate.getTime()) &&
    validUntilDate.toISOString().slice(0, 10) === vigente_hasta &&
    vigente_hasta >= fecha
  );
  const productos = budget.productos === undefined ? [] : budget.productos;
  const servicios = budget.servicios === undefined ? [] : budget.servicios;
  const dateParts = fecha.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsedDate = dateParts ? new Date(`${fecha}T00:00:00.000Z`) : null;
  const validDate = parsedDate !== null && !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === fecha;

  if (
    !idclientes ||
    !descripcion ||
    descripcion.length > 500 ||
    !validDate ||
    !validUntilIsValid ||
    !Array.isArray(productos) ||
    !Array.isArray(servicios) ||
    productos.length + servicios.length === 0 ||
    productos.length + servicios.length > 100
  ) return null;

  const normalizedProducts = productos.map((item) => {
    if (!item || typeof item !== "object") return null;
    const idproducto = typeof item.idproducto === "string" ? item.idproducto : "";
    const cantidad = typeof item.cantidad === "number" ? item.cantidad : Number.NaN;
    if (!idproducto || !Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 1_000_000) return null;
    return { idproducto, cantidad };
  });

  if (normalizedProducts.some((item) => item === null)) return null;
  const normalizedServices = servicios.map((item) => {
    if (!item || typeof item !== "object") return null;
    const idservicio = typeof item.idservicio === "string" ? item.idservicio : "";
    const cantidad = typeof item.cantidad === "number" ? item.cantidad : Number.NaN;
    if (!idservicio || !Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 1_000_000) return null;
    return { idservicio, cantidad };
  });
  if (normalizedServices.some((item) => item === null)) return null;
  return {
    idclientes,
    descripcion,
    fecha,
    estado,
    vigente_hasta,
    productos: normalizedProducts as BudgetInput["productos"],
    servicios: normalizedServices as BudgetInput["servicios"],
  };
}

export async function buildBudgetLines(input: BudgetInput): Promise<{ productos: BudgetProduct[]; servicios: BudgetService[] } | null> {
  const [products, serviceStore] = await Promise.all([
    readJsonEntity<ProductRecord[]>("productos.json", async () => []),
    input.servicios.length ? getServiceStore() : Promise.resolve(null),
  ]);
  const productLines: BudgetProduct[] = [];
  const serviceLines: BudgetService[] = [];

  for (const item of input.productos) {
    const product = products.find((candidate) => candidate.idproducto === item.idproducto);
    if (!product) return null;
    const valorTotal = Math.round(item.cantidad * product.Valor * 100) / 100;
    productLines.push({
      idproducto: product.idproducto,
      descripcion_producto: product.descripcion,
      cantidad: item.cantidad,
      valor_unitario: product.Valor,
      valor_total: valorTotal,
    });
  }

  for (const item of input.servicios) {
    const service = serviceStore?.servicios.find((candidate) => candidate.idservicio === item.idservicio);
    if (!service) return null;
    const valorTotal = Math.round(item.cantidad * service.Valor * 100) / 100;
    serviceLines.push({
      idservicio: service.idservicio,
      descripcion_servicio: service.descripcion,
      unidad_servicio: service.unidad,
      cantidad: item.cantidad,
      valor_unitario: service.Valor,
      valor_total: valorTotal,
    });
  }

  return { productos: productLines, servicios: serviceLines };
}

export async function createBudgetUpdate(payload: unknown) {
  const input = parseBudget(payload);
  if (!input) return { input: null, lines: null };
  return { input, lines: await buildBudgetLines(input) };
}