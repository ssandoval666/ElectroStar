import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { readJsonEntity } from "@/lib/drive-json-store";

export type UserProfile = "Admin" | "Operario";

export type StoredUser = {
  idusuario: string;
  usuario: string;
  password: string;
  perfil: UserProfile;
};

export type PublicUser = Omit<StoredUser, "password">;

export async function getUsers(): Promise<StoredUser[]> {
  // readJsonEntity busca el archivo; si existe, devuelve su contenido.
  // Si no existe, ejecuta la función de creación inicial.
  return readJsonEntity("usuarios.json", async () => {
    // Retornamos un arreglo vacío para que el sistema dependa 
    // exclusivamente de los registros guardados en el JSON.
    return [];
  });
}

export function toPublicUser(user: StoredUser): PublicUser {
  return {
    idusuario: user.idusuario,
    usuario: user.usuario,
    perfil: user.perfil,
  };
}