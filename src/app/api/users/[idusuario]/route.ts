import bcrypt from "bcryptjs";
import { getAdminSessionUser } from "@/lib/session";
import { writeJsonEntity } from "@/lib/drive-json-store";
import { getUsers, toPublicUser, type UserProfile } from "@/lib/users";

type RouteContext = { params: Promise<{ idusuario: string }> };
type UpdateUserPayload = {
  usuario?: unknown;
  password?: unknown;
  perfil?: unknown;
};

const validProfiles: UserProfile[] = ["Admin", "Operario"];

export async function PATCH(request: Request, { params }: RouteContext) {
  const admin = await getAdminSessionUser();
  if (!admin) return Response.json({ message: "No autorizado." }, { status: 403 });

  const { idusuario } = await params;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ message: "El cuerpo de la solicitud no es válido." }, { status: 400 });
  }
  if (!payload || typeof payload !== "object") {
    return Response.json({ message: "El cuerpo de la solicitud no es válido." }, { status: 400 });
  }

  const userPayload = payload as UpdateUserPayload;
  const username = typeof userPayload.usuario === "string" ? userPayload.usuario.trim() : "";
  const profile = userPayload.perfil;
  const password = typeof userPayload.password === "string" ? userPayload.password : "";
  if (!username || username.length > 64 || !validProfiles.includes(profile as UserProfile)) {
    return Response.json({ message: "Ingresá un usuario y un perfil válido." }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ message: "La contraseña debe tener al menos 8 caracteres." }, { status: 400 });
  }

  try {
    const users = await getUsers();
    const index = users.findIndex((user) => user.idusuario === idusuario);
    if (index === -1) return Response.json({ message: "Usuario no encontrado." }, { status: 404 });
    if (users.some((user) => user.idusuario !== idusuario && user.usuario.toLowerCase() === username.toLowerCase())) {
      return Response.json({ message: "Ese nombre de usuario ya existe." }, { status: 409 });
    }

    const currentUser = users[index];
    if (currentUser.perfil === "Admin" && profile !== "Admin") {
      const anotherAdminExists = users.some((user) => user.idusuario !== idusuario && user.perfil === "Admin");
      if (!anotherAdminExists || admin.idusuario === idusuario) {
        return Response.json({ message: "No podés quitar el último perfil Admin ni cambiar tu propio perfil." }, { status: 409 });
      }
    }

    const updatedUser = {
      ...currentUser,
      usuario: username,
      perfil: profile as UserProfile,
      password: await bcrypt.hash(password, 12),
    };
    users[index] = updatedUser;
    await writeJsonEntity("usuarios.json", users);

    return Response.json({ user: toPublicUser(updatedUser) });
  } catch (error) {
    console.error("Users update error:", error);
    return Response.json({ message: "No se pudo actualizar el usuario." }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const admin = await getAdminSessionUser();
  if (!admin) return Response.json({ message: "No autorizado." }, { status: 403 });

  const { idusuario } = await params;
  if (admin.idusuario === idusuario) {
    return Response.json({ message: "No podés eliminar tu propia cuenta." }, { status: 409 });
  }

  try {
    const users = await getUsers();
    const user = users.find((item) => item.idusuario === idusuario);
    if (!user) return Response.json({ message: "Usuario no encontrado." }, { status: 404 });

    if (user.perfil === "Admin" && !users.some((item) => item.idusuario !== idusuario && item.perfil === "Admin")) {
      return Response.json({ message: "No se puede eliminar el último usuario Admin." }, { status: 409 });
    }

    await writeJsonEntity("usuarios.json", users.filter((item) => item.idusuario !== idusuario));
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Users delete error:", error);
    return Response.json({ message: "No se pudo eliminar el usuario." }, { status: 503 });
  }
}