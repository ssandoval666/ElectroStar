import { getAdminSessionUser } from "@/lib/session";
import { readJsonEntity, writeJsonEntity } from "@/lib/drive-json-store";
import type { StockRecord } from "@/lib/stock";

type RouteContext = { params: Promise<{ idproducto: string }> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseQuantity(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const admin = await getAdminSessionUser();
  if (!admin) return Response.json({ message: "No autorizado." }, { status: 403 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ message: "El cuerpo de la solicitud no es válido." }, { status: 400 });
  }
  const cantidad = isRecord(payload)
    ? parseQuantity(payload.cantidad)
    : null;
  if (cantidad === null) return Response.json({ message: "Ingresá una cantidad válida igual o mayor a cero." }, { status: 400 });

  const { idproducto } = await params;
  try {
    const items = await readJsonEntity<StockRecord[]>("stock.json", async () => []);
    const index = items.findIndex((item) => item.idproducto === idproducto);
    if (index === -1) return Response.json({ message: "El producto no está cargado en el inventario." }, { status: 404 });

    const item: StockRecord = {
      ...items[index],
      cantidad,
      fecha_modificacion: new Date().toISOString(),
      usuario_modificacion: admin.idusuario,
    };
    items[index] = item;
    await writeJsonEntity("stock.json", items);
    return Response.json({ item });
  } catch (error) {
    console.error("Stock update error:", error);
    return Response.json({ message: "No se pudo actualizar la cantidad disponible." }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const admin = await getAdminSessionUser();
  if (!admin) return Response.json({ message: "No autorizado." }, { status: 403 });

  const { idproducto } = await params;
  try {
    const items = await readJsonEntity<StockRecord[]>("stock.json", async () => []);
    if (!items.some((item) => item.idproducto === idproducto)) {
      return Response.json({ message: "El producto no está cargado en el inventario." }, { status: 404 });
    }
    await writeJsonEntity("stock.json", items.filter((item) => item.idproducto !== idproducto));
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Stock delete error:", error);
    return Response.json({ message: "No se pudo quitar el producto del inventario." }, { status: 503 });
  }
}
