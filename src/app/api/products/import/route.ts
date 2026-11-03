import { getAdminSessionUser } from "@/lib/session";

export async function POST(request: Request) {
  const admin = await getAdminSessionUser();
  if (!admin) return Response.json({ message: "No autorizado." }, { status: 403 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ message: "El formulario del archivo no es válido." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ message: "Seleccioná un archivo válido." }, { status: 400 });
  }

  return Response.json(
    { message: "La importación está pendiente de definir el formato del archivo. No se modificó productos.json." },
    { status: 501 },
  );
}