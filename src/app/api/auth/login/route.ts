import bcrypt from "bcryptjs";
import { setSessionCookie } from "@/lib/session";
import { getUsers, toPublicUser } from "@/lib/users";

type LoginPayload = {
  username?: unknown;
  password?: unknown;
};

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ message: "El cuerpo de la solicitud no es válido." }, { status: 400 });
  }

  if (!payload || typeof payload !== "object" || !("username" in payload) || !("password" in payload)) {
    return Response.json({ message: "Faltan datos de acceso." }, { status: 400 });
  }

  const credentials = payload as LoginPayload;
  if (typeof credentials.username !== "string" || typeof credentials.password !== "string") {
    return Response.json({ message: "Usuario o contraseña incorrectos." }, { status: 401 });
  }
  const username = credentials.username;
  const password = credentials.password;

  try {
    const users = await getUsers();
    const user = users.find((candidate) => candidate.usuario.toLowerCase() === username.toLowerCase());

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return Response.json({ message: "Usuario o contraseña incorrectos." }, { status: 401 });
    }

    const publicUser = toPublicUser(user);
    await setSessionCookie(publicUser, user.sessionVersion ?? 0);

    return Response.json({ user: publicUser });
  } catch (error) {
    console.error("Login persistence error:", error);
    return Response.json({ message: "No se pudo acceder al almacenamiento de usuarios." }, { status: 503 });
  }
}