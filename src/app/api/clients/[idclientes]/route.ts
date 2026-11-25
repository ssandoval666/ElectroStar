import { getAdminSessionUser } from "@/lib/session";
import { readJsonEntity, writeJsonEntity } from "@/lib/drive-json-store";
import { parseClientFields, type ClientRecord } from "@/lib/budgets";

type RouteContext = { params: Promise<{ idclientes: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const admin = await getAdminSessionUser();
  if (!admin) return Response.json({ message: "No autorizado." }, { status: 403 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ message: "El cuerpo de la solicitud no es válido." }, { status: 400 });
  }

  const input = parseClientFields(payload);
  if (!input) return Response.json({ message: "Revisá nombre, apellido y teléfono. La dirección admite hasta 240 caracteres y el CUIT/CUIL, si se ingresa, debe tener 11 dígitos." }, { status: 400 });

  try {
    const { idclientes } = await params;
    const clients = await readJsonEntity<ClientRecord[]>("clientes.json", async () => []);
    const index = clients.findIndex((client) => client.idclientes === idclientes);
    if (index < 0) return Response.json({ message: "Cliente no encontrado." }, { status: 404 });

    const updatedClient: ClientRecord = {
      ...clients[index],
      ...input,
      direccion: input.direccion,
      cuit_cuil: input.cuit_cuil,
      observaciones: input.observaciones,
    };
    clients[index] = updatedClient;
    await writeJsonEntity("clientes.json", clients);
    return Response.json({ client: updatedClient });
  } catch (error) {
    console.error("Client update error:", error);
    return Response.json({ message: "No se pudo actualizar el cliente." }, { status: 503 });
  }
}
