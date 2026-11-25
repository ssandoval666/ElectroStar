import { getAdminSessionUser } from "@/lib/session";
import { readJsonEntity, writeJsonEntity } from "@/lib/drive-json-store";
import type { ProductRecord } from "@/app/api/products/route";
import type { StockRecord } from "@/lib/stock";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseQuantity(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export async function GET() {
  const admin = await getAdminSessionUser();
  if (!admin) return Response.json({ message: "No autorizado." }, { status: 403 });

  try {
    const [items, products] = await Promise.all([
      readJsonEntity<StockRecord[]>("stock.json", async () => []),
      readJsonEntity<ProductRecord[]>("productos.json", async () => []),
    ]);
    return Response.json({ items, products });
  } catch (error) {
    console.error("Stock read error:", error);
    return Response.json({ message: "No se pudo leer el inventario." }, { status: 503 });
  }
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

  if (!isRecord(payload)) {
    return Response.json({ message: "Seleccioná un producto e ingresá una cantidad válida." }, { status: 400 });
  }
  const idproducto = typeof payload.idproducto === "string" ? payload.idproducto : "";
  const cantidad = parseQuantity(payload.cantidad);
  if (!idproducto || cantidad === null) {
    return Response.json({ message: "Seleccioná un producto e ingresá una cantidad válida." }, { status: 400 });
  }

  try {
    const [items, products] = await Promise.all([
      readJsonEntity<StockRecord[]>("stock.json", async () => []),
      readJsonEntity<ProductRecord[]>("productos.json", async () => []),
    ]);
    if (!products.some((product) => product.idproducto === idproducto)) {
      return Response.json({ message: "El producto seleccionado no existe." }, { status: 404 });
    }
    if (items.some((item) => item.idproducto === idproducto)) {
      return Response.json({ message: "El producto ya está cargado en el inventario." }, { status: 409 });
    }

    const item: StockRecord = {
      idproducto,
      cantidad,
      fecha_modificacion: new Date().toISOString(),
      usuario_modificacion: admin.idusuario,
    };
    await writeJsonEntity("stock.json", [...items, item]);
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    console.error("Stock create error:", error);
    return Response.json({ message: "No se pudo guardar el producto en el inventario." }, { status: 503 });
  }
}
