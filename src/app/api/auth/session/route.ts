import { getCurrentSessionUser } from "@/lib/session";

export async function GET() {
  const user = await getCurrentSessionUser();
  if (!user) return Response.json({ message: "Sesión no válida." }, { status: 401 });
  return Response.json({ user });
}