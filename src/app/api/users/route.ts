import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { getAdminSessionUser } from "@/lib/session";
import { writeJsonEntity } from "@/lib/drive-json-store";
import { getUsers, invalidateSessionUsersCache, toPublicUser, type UserProfile } from "@/lib/users";
import { getProfiles } from "@/lib/profiles";

type CreateUserPayload = {
  usuario?: unknown;
  nombre?: unknown;
  apellido?: unknown;
  password?: unknown;
  perfil?: unknown;
};

export async function GET() {
  const admin = await getAdminSessionUser();
  if (!admin) return Response.json({ message: "No autorizado." }, { status: 403 });

  try {
    const users = await getUsers();
    return Response.json({ items: users.map(toPublicUser) });
  } catch (error) {
    console.error("Users read error:", error);
    return Response.json({ message: "No se pudo leer usuarios.json." }, { status: 503 });
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
  if (!payload || typeof payload !== "object") {
    return Response.json({ message: "El cuerpo de la solicitud no es válido." }, { status: 400 });
  }

  const userPayload = payload as CreateUserPayload;
  const username = typeof userPayload.usuario === "string" ? userPayload.usuario.trim() : "";
  const firstName = typeof userPayload.nombre === "string" ? userPayload.nombre.trim() : "";
  const lastName = typeof userPayload.apellido === "string" ? userPayload.apellido.trim() : "";
  const password = typeof userPayload.password === "string" ? userPayload.password : "";
  const profile = userPayload.perfil;

  if (
    !username || username.length > 64 ||
    !firstName || firstName.length > 80 ||
    !lastName || lastName.length > 80 ||
    password.length < 8 ||
    typeof profile !== "string"
  ) {
    return Response.json({ message: "Ingresá usuario, nombre, apellido, contraseña de al menos 8 caracteres y un perfil válido." }, { status: 400 });
  }

  try {
    const validProfiles = await getProfiles();
    if (!validProfiles.includes(profile)) {
      return Response.json({ message: "Ingresá usuario, nombre, apellido, contraseña de al menos 8 caracteres y un perfil válido." }, { status: 400 });
    }
    const users = await getUsers();
    if (users.some((user) => user.usuario.toLowerCase() === username.toLowerCase())) {
      return Response.json({ message: "Ese nombre de usuario ya existe." }, { status: 409 });
    }

    const newUser = {
      idusuario: randomUUID(),
      usuario: username,
      nombre: firstName,
      apellido: lastName,
      password: await bcrypt.hash(password, 12),
      perfil: profile as UserProfile,
      sessionVersion: 0,
    };
    await writeJsonEntity("usuarios.json", [...users, newUser]);
    invalidateSessionUsersCache();

    return Response.json({ user: toPublicUser(newUser) }, { status: 201 });
  } catch (error) {
    console.error("Users create error:", error);
    return Response.json({ message: "No se pudo guardar el usuario." }, { status: 503 });
  }
}