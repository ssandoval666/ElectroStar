import { getAdminSessionUser } from "@/lib/session";
import { readJsonEntity, writeJsonEntity } from "@/lib/drive-json-store";
import type { ProductRecord } from "@/app/api/products/route";

type RouteContext = { params: Promise<{ idproducto: string }> };
type ProductPayload = { descripcion?: unknown; Valor?: unknown };

function parseProductPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;

  const productPayload = payload as ProductPayload;
  const descripcion = typeof productPayload.descripcion === "string"
    ? productPayload.descripcion.trim()
    : "";
  const Valor = typeof productPayload.Valor === "number" ? productPayload.Valor : Number.NaN;

  if (!descripcion || descripcion.length > 160 || !Number.isFinite(Valor) || Valor < 0) return null;
  return { descripcion, Valor };
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

  const input = parseProductPayload(payload);
  if (!input) return Response.json({ message: "Ingresá una descripción y un valor válido." }, { status: 400 });

  const { idproducto } = await params;
  try {
    const items = await readJsonEntity<ProductRecord[]>("productos.json", async () => []);
    const index = items.findIndex((item) => item.idproducto === idproducto);
    if (index === -1) return Response.json({ message: "Producto no encontrado." }, { status: 404 });

    const product: ProductRecord = {
      ...items[index],
      ...input,
      fecha_modificacion: new Date().toISOString(),
      usuario_modificacion: admin.idusuario,
    };
    items[index] = product;
    await writeJsonEntity("productos.json", items);
    return Response.json({ product });
  } catch (error) {
    console.error("Product update error:", error);
    return Response.json({ message: "No se pudo actualizar el producto." }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const admin = await getAdminSessionUser();
  if (!admin) return Response.json({ message: "No autorizado." }, { status: 403 });

  const { idproducto } = await params;
  try {
    const items = await readJsonEntity<ProductRecord[]>("productos.json", async () => []);
    if (!items.some((item) => item.idproducto === idproducto)) {
      return Response.json({ message: "Producto no encontrado." }, { status: 404 });
    }

    await writeJsonEntity("productos.json", items.filter((item) => item.idproducto !== idproducto));
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Product delete error:", error);
    return Response.json({ message: "No se pudo eliminar el producto." }, { status: 503 });
  }
}