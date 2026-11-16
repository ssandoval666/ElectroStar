import { getAdminSessionUser } from "@/lib/session";
import { getProfiles, isProtectedProfile, isValidProfileName } from "@/lib/profiles";
import { getUsers } from "@/lib/users";
import { readJsonEntity, writeJsonEntity } from "@/lib/drive-json-store";
import { initialMenu } from "@/lib/menu";

type RouteContext = { params: Promise<{ name: string }> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function menuUsesProfile(value: unknown, profile: string): boolean {
  if (!isRecord(value)) return false;
  if (Array.isArray(value.profiles) && value.profiles.includes(profile)) return true;
  return Array.isArray(value.children) && value.children.some((child) => menuUsesProfile(child, profile));
}

async function profileIsInUse(profile: string) {
  const [users, menu] = await Promise.all([
    getUsers(),
    readJsonEntity<unknown>("menu.json", async () => initialMenu),
  ]);
  return users.some((user) => user.perfil === profile) ||
    (Array.isArray(menu) && menu.some((item) => menuUsesProfile(item, profile)));
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const admin = await getAdminSessionUser();
  if (!admin) return Response.json({ message: "No autorizado." }, { status: 403 });
  const { name: currentName } = await params;
  if (isProtectedProfile(currentName)) {
    return Response.json({ message: "Los perfiles Admin y Operario están protegidos." }, { status: 409 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ message: "El cuerpo de la solicitud no es válido." }, { status: 400 });
  }
  const nextName = payload && typeof payload === "object" && "nombre" in payload ? payload.nombre : null;
  if (!isValidProfileName(nextName)) {
    return Response.json({ message: "Ingresá un nombre de perfil válido (hasta 40 caracteres)." }, { status: 400 });
  }

  try {
    const profiles = await getProfiles();
    if (!profiles.includes(currentName)) return Response.json({ message: "Perfil no encontrado." }, { status: 404 });
    if (profiles.some((profile) => profile !== currentName && profile.toLocaleLowerCase() === nextName.toLocaleLowerCase())) {
      return Response.json({ message: "Ese perfil ya existe." }, { status: 409 });
    }
    if (nextName === currentName) return Response.json({ items: profiles });
    if (await profileIsInUse(currentName)) {
      return Response.json({ message: "No se puede renombrar un perfil asignado a usuarios o menús." }, { status: 409 });
    }
    const items = profiles.map((profile) => profile === currentName ? nextName : profile);
    await writeJsonEntity("perfiles.json", items);
    return Response.json({ items });
  } catch (error) {
    console.error("Profiles update error:", error);
    return Response.json({ message: "No se pudo actualizar perfiles.json." }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const admin = await getAdminSessionUser();
  if (!admin) return Response.json({ message: "No autorizado." }, { status: 403 });
  const { name } = await params;
  if (isProtectedProfile(name)) {
    return Response.json({ message: "Los perfiles Admin y Operario están protegidos." }, { status: 409 });
  }

  try {
    const profiles = await getProfiles();
    if (!profiles.includes(name)) return Response.json({ message: "Perfil no encontrado." }, { status: 404 });
    if (await profileIsInUse(name)) {
      return Response.json({ message: "No se puede eliminar un perfil asignado a usuarios o menús." }, { status: 409 });
    }
    const items = profiles.filter((profile) => profile !== name);
    await writeJsonEntity("perfiles.json", items);
    return Response.json({ items });
  } catch (error) {
    console.error("Profiles delete error:", error);
    return Response.json({ message: "No se pudo actualizar perfiles.json." }, { status: 503 });
  }
}
