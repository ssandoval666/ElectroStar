import { getAdminSessionUser } from "@/lib/session";
import { getProfiles, isValidProfileName } from "@/lib/profiles";
import { writeJsonEntity } from "@/lib/drive-json-store";

export async function GET() {
  const admin = await getAdminSessionUser();
  if (!admin) return Response.json({ message: "No autorizado." }, { status: 403 });

  try {
    return Response.json({ items: await getProfiles() });
  } catch (error) {
    console.error("Profiles read error:", error);
    return Response.json({ message: "No se pudo leer perfiles.json." }, { status: 503 });
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
  const name = payload && typeof payload === "object" && "nombre" in payload ? payload.nombre : null;
  if (!isValidProfileName(name)) {
    return Response.json({ message: "Ingresá un nombre de perfil válido (hasta 40 caracteres)." }, { status: 400 });
  }

  try {
    const profiles = await getProfiles();
    if (profiles.some((profile) => profile.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      return Response.json({ message: "Ese perfil ya existe." }, { status: 409 });
    }
    const items = [...profiles, name];
    await writeJsonEntity("perfiles.json", items);
    return Response.json({ items }, { status: 201 });
  } catch (error) {
    console.error("Profiles create error:", error);
    return Response.json({ message: "No se pudo guardar perfiles.json." }, { status: 503 });
  }
}
