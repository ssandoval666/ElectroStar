import { readJsonEntity } from "@/lib/drive-json-store";

export const protectedProfiles = ["Admin", "Operario"] as const;
export type UserProfile = string;

export async function getProfiles(): Promise<UserProfile[]> {
  const profiles = await readJsonEntity<unknown>("perfiles.json", async () => [...protectedProfiles]);
  if (
    !Array.isArray(profiles) ||
    profiles.length < protectedProfiles.length ||
    !profiles.every((profile) => isValidProfileName(profile)) ||
    !protectedProfiles.every((profile) => profiles.includes(profile)) ||
    new Set(profiles.map((profile) => profile.toLocaleLowerCase())).size !== profiles.length
  ) {
    throw new Error("perfiles.json contiene una lista de perfiles no válida.");
  }
  return profiles;
}

export function isValidProfileName(value: unknown): value is UserProfile {
  return typeof value === "string" &&
    value === value.trim() &&
    /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,39}$/u.test(value);
}

export function isProtectedProfile(profile: string): boolean {
  return protectedProfiles.includes(profile as (typeof protectedProfiles)[number]);
}
