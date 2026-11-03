import { randomUUID } from "node:crypto";
import { getAdminSessionUser } from "@/lib/session";
import { readJsonEntity, writeJsonEntity } from "@/lib/drive-json-store";

export type ProductRecord = {
  idproducto: string;
  descripcion: string;
  Valor: number;
  fecha_modificacion: string;
  usuario_modificacion: string;
};

type ProductPayload = {
  descripcion?: unknown;
  Valor?: unknown;
};

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

export async function GET() {
  const admin = await getAdminSessionUser();
  if (!admin) return Response.json({ message: "No autorizado." }, { status: 403 });

  try {
    const items = await readJsonEntity<ProductRecord[]>("productos.json", async () => []);
    return Response.json({ items });
  } catch (error) {
    console.error("Products read error:", error);
    return Response.json({ message: "No se pudo leer productos.json." }, { status: 503 });
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

  const input = parseProductPayload(payload);
  if (!input) return Response.json({ message: "Ingresá una descripción y un valor válido." }, { status: 400 });

  try {
    const items = await readJsonEntity<ProductRecord[]>("productos.json", async () => []);
    const product: ProductRecord = {
      idproducto: randomUUID(),
      ...input,
      fecha_modificacion: new Date().toISOString(),
      usuario_modificacion: admin.idusuario,
    };
    await writeJsonEntity("productos.json", [...items, product]);
    return Response.json({ product }, { status: 201 });
  } catch (error) {
    console.error("Product create error:", error);
    return Response.json({ message: "No se pudo guardar el producto." }, { status: 503 });
  }
}