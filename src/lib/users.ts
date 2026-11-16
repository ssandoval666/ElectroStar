import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { readJsonEntity } from "@/lib/drive-json-store";
import type { UserProfile } from "@/lib/profiles";
export type { UserProfile } from "@/lib/profiles";

export type StoredUser = {
  idusuario: string;
  usuario: string;
  nombre?: string;
  apellido?: string;
  password: string;
  perfil: UserProfile;
  sessionVersion?: number;
};

export type PublicUser = Omit<StoredUser, "password" | "sessionVersion">;

const SESSION_USERS_CACHE_TTL_MS = 5_000;
export type SessionUserRecord = { user: PublicUser; sessionVersion: number };
type SessionUsersSnapshot = { usersById: Map<string, SessionUserRecord>; expiresAt: number };

let sessionUsersSnapshot: SessionUsersSnapshot | null = null;
let sessionUsersLoad: Promise<Map<string, SessionUserRecord>> | null = null;
let sessionUsersVersion = 0;

export async function getUsers(): Promise<StoredUser[]> {
  // readJsonEntity busca el archivo; si existe, devuelve su contenido.
  // Si no existe, ejecuta la función de creación inicial.
  return readJsonEntity("usuarios.json", async () => {
    // Retornamos un arreglo vacío para que el sistema dependa 
    // exclusivamente de los registros guardados en el JSON.
    return [];
  });
}

export function invalidateSessionUsersCache() {
  sessionUsersVersion += 1;
  sessionUsersSnapshot = null;
  sessionUsersLoad = null;
}

export async function getSessionUserById(idusuario: string): Promise<SessionUserRecord | null> {
  if (sessionUsersSnapshot && sessionUsersSnapshot.expiresAt > Date.now()) {
    return sessionUsersSnapshot.usersById.get(idusuario) ?? null;
  }

  if (!sessionUsersLoad) {
    const version = sessionUsersVersion;
    const load = getUsers().then((users) => {
      const usersById = new Map(users.map((user) => [
        user.idusuario,
        { user: toPublicUser(user), sessionVersion: user.sessionVersion ?? 0 },
      ]));
      if (sessionUsersVersion === version) {
        sessionUsersSnapshot = { usersById, expiresAt: Date.now() + SESSION_USERS_CACHE_TTL_MS };
      }
      return usersById;
    });
    const trackedLoad = load.finally(() => {
      if (sessionUsersLoad === trackedLoad) sessionUsersLoad = null;
    });
    sessionUsersLoad = trackedLoad;
  }

  const usersById = await sessionUsersLoad;
  return usersById.get(idusuario) ?? null;
}

export function toPublicUser(user: StoredUser): PublicUser {
  return {
    idusuario: user.idusuario,
    usuario: user.usuario,
    ...(user.nombre ? { nombre: user.nombre } : {}),
    ...(user.apellido ? { apellido: user.apellido } : {}),
    perfil: user.perfil,
  };
}