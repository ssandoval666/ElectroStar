import { readJsonEntity } from "@/lib/drive-json-store";
import type { BudgetProduct } from "@/lib/budgets";
import type { ProductRecord } from "@/app/api/products/route";

export type BudgetInput = {
  idclientes: string;
  descripcion: string;
  fecha: string;
  productos: Array<{ idproducto: string; cantidad: number }>;
};

export function parseBudget(payload: unknown): BudgetInput | null {
  if (!payload || typeof payload !== "object") return null;

  const budget = payload as Partial<BudgetInput>;
  const idclientes = typeof budget.idclientes === "string" ? budget.idclientes : "";
  const descripcion = typeof budget.descripcion === "string" ? budget.descripcion.trim() : "";
  const fecha = typeof budget.fecha === "string" ? budget.fecha : "";
  const productos = budget.productos;
  const dateParts = fecha.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsedDate = dateParts ? new Date(`${fecha}T00:00:00.000Z`) : null;
  const validDate = parsedDate !== null && !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === fecha;

  if (!idclientes || !descripcion || descripcion.length > 500 || !validDate || !Array.isArray(productos) || productos.length === 0 || productos.length > 100) return null;

  const normalizedProducts = productos.map((item) => {
    if (!item || typeof item !== "object") return null;
    const idproducto = typeof item.idproducto === "string" ? item.idproducto : "";
    const cantidad = typeof item.cantidad === "number" ? item.cantidad : Number.NaN;
    if (!idproducto || !Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 1_000_000) return null;
    return { idproducto, cantidad };
  });

  if (normalizedProducts.some((item) => item === null)) return null;
  return { idclientes, descripcion, fecha, productos: normalizedProducts as BudgetInput["productos"] };
}

export async function buildBudgetProducts(input: BudgetInput): Promise<BudgetProduct[] | null> {
  const products = await readJsonEntity<ProductRecord[]>("productos.json", async () => []);
  const lines: BudgetProduct[] = [];

  for (const item of input.productos) {
    const product = products.find((candidate) => candidate.idproducto === item.idproducto);
    if (!product) return null;
    const valorTotal = Math.round(item.cantidad * product.Valor * 100) / 100;
    lines.push({
      idproducto: product.idproducto,
      descripcion_producto: product.descripcion,
      cantidad: item.cantidad,
      valor_unitario: product.Valor,
      valor_total: valorTotal,
    });
  }

  return lines;
}

export async function createBudgetUpdate(payload: unknown) {
  const input = parseBudget(payload);
  if (!input) return { input: null, productos: null };
  return { input, productos: await buildBudgetProducts(input) };
}