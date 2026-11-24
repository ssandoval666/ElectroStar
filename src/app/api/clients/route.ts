import { randomUUID } from "node:crypto";
import { getAdminSessionUser } from "@/lib/session";
import { readJsonEntity, writeJsonEntity } from "@/lib/drive-json-store";
import { parseClientFields, type ClientRecord } from "@/lib/budgets";

export async function GET() {
  const admin = await getAdminSessionUser();
  if (!admin) return Response.json({ message: "No autorizado." }, { status: 403 });

  try {
    const items = await readJsonEntity<ClientRecord[]>("clientes.json", async () => []);
    return Response.json({ items });
  } catch (error) {
    console.error("Clients read error:", error);
    return Response.json({ message: "No se pudo leer clientes.json." }, { status: 503 });
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

  const input = parseClientFields(payload);
  if (!input) return Response.json({ message: "Ingresá nombre, apellido y teléfono válidos. La dirección puede tener hasta 240 caracteres." }, { status: 400 });

  try {
    const items = await readJsonEntity<ClientRecord[]>("clientes.json", async () => []);
    const client: ClientRecord = { idclientes: randomUUID(), ...input };
    await writeJsonEntity("clientes.json", [...items, client]);
    return Response.json({ client }, { status: 201 });
  } catch (error) {
    console.error("Client create error:", error);
    return Response.json({ message: "No se pudo guardar el cliente." }, { status: 503 });
  }
}