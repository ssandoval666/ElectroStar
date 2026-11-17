import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getSessionUserById, type PublicUser } from "@/lib/users";

export const SESSION_COOKIE_NAME = "con100ciaelectrica_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const SESSION_REFRESH_THRESHOLD_SECONDS = SESSION_MAX_AGE_SECONDS / 2;
const SESSION_ISSUER = "con100ciaelectrica";

export type SessionUser = PublicUser;
type SessionPayload = SessionUser & {
  sub: string;
  iss: string;
  iat: number;
  exp: number;
  sessionVersion: number;
};

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Falta configurar SESSION_SECRET.");
  if (Buffer.byteLength(secret) < 32) throw new Error("SESSION_SECRET debe tener al menos 32 bytes.");
  return secret;
}

function sign(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest();
}

export function createSessionToken(user: SessionUser, sessionVersion: number) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    ...user,
    sub: user.idusuario,
    iss: SESSION_ISSUER,
    iat: issuedAt,
    exp: issuedAt + SESSION_MAX_AGE_SECONDS,
    sessionVersion,
  };
  const encodedHeader = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  return `${unsignedToken}.${sign(unsignedToken).toString("base64url")}`;
}

function verifySessionToken(token: string): { user: SessionUser; expiresAt: number; sessionVersion: number } | null {
  if (token.length > 4096) return null;
  const [encodedHeader, encodedPayload, providedSignature, extraSegment] = token.split(".");
  if (!encodedHeader || !encodedPayload || !providedSignature || extraSegment) return null;

  let header: unknown;
  try {
    header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!header || typeof header !== "object" || !("alg" in header) || header.alg !== "HS256" || !("typ" in header) || header.typ !== "JWT") {
    return null;
  }

  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const expectedBuffer = sign(unsignedToken);
  const providedBuffer = Buffer.from(providedSignature, "base64url");
  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as SessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (
      payload.iss !== SESSION_ISSUER ||
      payload.sub !== payload.idusuario ||
      typeof payload.idusuario !== "string" ||
      typeof payload.usuario !== "string" ||
      (payload.nombre !== undefined && typeof payload.nombre !== "string") ||
      (payload.apellido !== undefined && typeof payload.apellido !== "string") ||
      typeof payload.perfil !== "string" ||
      !payload.perfil ||
      !Number.isInteger(payload.iat) ||
      !Number.isInteger(payload.exp) ||
      !Number.isSafeInteger(payload.sessionVersion) ||
      payload.sessionVersion < 0 ||
      payload.iat > now ||
      payload.exp <= now ||
      payload.exp <= payload.iat ||
      payload.exp - payload.iat > SESSION_MAX_AGE_SECONDS
    ) return null;

    return {
      user: {
        idusuario: payload.idusuario,
        usuario: payload.usuario,
        ...(payload.nombre ? { nombre: payload.nombre } : {}),
        ...(payload.apellido ? { apellido: payload.apellido } : {}),
        perfil: payload.perfil,
      },
      expiresAt: payload.exp,
      sessionVersion: payload.sessionVersion,
    };
  } catch {
    return null;
  }
}

async function getVerifiedSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return token ? verifySessionToken(token) : null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  return (await getVerifiedSession())?.user ?? null;
}

export async function setSessionCookie(user: SessionUser, sessionVersion: number) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, createSessionToken(user, sessionVersion), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function getCurrentSessionUser(): Promise<SessionUser | null> {
  const session = await getVerifiedSession();
  if (!session) return null;

  const storedUser = await getSessionUserById(session.user.idusuario);
  if (!storedUser) return null;
  const sessionVersion = storedUser.sessionVersion;
  if (session.sessionVersion !== sessionVersion) return null;

  const publicUser = storedUser.user;
  const secondsUntilExpiry = session.expiresAt - Math.floor(Date.now() / 1000);
  if (secondsUntilExpiry <= SESSION_REFRESH_THRESHOLD_SECONDS) {
    await setSessionCookie(publicUser, sessionVersion);
  }
  return publicUser;
}

export async function getAdminSessionUser(): Promise<SessionUser | null> {
  const user = await getCurrentSessionUser();
  return user?.perfil === "Admin" ? user : null;
}