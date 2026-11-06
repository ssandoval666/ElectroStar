import { getAdminSessionUser, getCurrentSessionUser } from "@/lib/session";
import { initialMenu, menuDestinations, menuIcons, type MenuDestination, type MenuItem, type MenuProfile } from "@/lib/menu";
import { readJsonEntity, writeJsonEntity } from "@/lib/drive-json-store";

const profiles: MenuProfile[] = ["Admin", "Operario"];
const destinations = new Set<string>(menuDestinations.map((destination) => destination.value));
const icons = new Set<string>(menuIcons.map((icon) => icon.value));
const destinationByValue = new Map<string, (typeof menuDestinations)[number]>(menuDestinations.map((destination) => [destination.value, destination]));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeMenuItem(value: unknown, depth = 0): MenuItem {
  if (!isRecord(value) || depth > 6) throw new Error("La estructura del menú no es válida.");
  const childrenValue = value.children;
  if (childrenValue !== undefined && !Array.isArray(childrenValue)) throw new Error("La estructura del menú no es válida.");
  const children = Array.isArray(childrenValue)
    ? childrenValue.map((child) => normalizeMenuItem(child, depth + 1))
    : undefined;
  const id = typeof value.id === "string" ? value.id : "";
  let validProfiles: MenuProfile[];
  if (value.profiles === undefined) {
    validProfiles = id === "calendar" || id === "work-orders" ? ["Admin", "Operario"] : ["Admin"];
  } else if (Array.isArray(value.profiles) && value.profiles.length > 0 && value.profiles.every((profile) => profiles.includes(profile as MenuProfile))) {
    validProfiles = value.profiles as MenuProfile[];
  } else {
    throw new Error("Los perfiles del menú no son válidos.");
  }
  const destinationValue = value.destination;
  if (destinationValue !== undefined && destinationValue !== null && (typeof destinationValue !== "string" || !destinations.has(destinationValue))) {
    throw new Error("El destino del menú no es válido.");
  }
  const destination = destinationValue === null
    ? null
    : typeof destinationValue === "string"
      ? destinationValue as MenuDestination
      : childrenValue !== undefined
        ? null
        : destinations.has(id)
          ? id as MenuDestination
          : null;

  return {
    id,
    label: typeof value.label === "string" ? value.label : "",
    icon: typeof value.icon === "string" && icons.has(value.icon) ? value.icon : "home",
    profiles: validProfiles,
    destination,
    ...(children ? { children } : {}),
  };
}

function filterMenu(items: MenuItem[], profile: MenuProfile): MenuItem[] {
  return items.flatMap((item) => {
    if (!item.profiles.includes(profile)) return [];
    const children = item.children ? filterMenu(item.children, profile) : undefined;
    if (item.destination === null && children?.length === 0) return [];
    return [{ ...item, ...(children ? { children } : {}) }];
  });
}

function ensureRequiredMenuItems(items: MenuItem[]) {
  let updated = false;
  const requiredAdministration = initialMenu.find((item) => item.id === "administration")!;
  const requiredMenuManagement = requiredAdministration.children!.find((item) => item.id === "menu-management")!;
  let administration = items.find((item) => item.id === "administration");
  if (!administration) {
    administration = structuredClone(requiredAdministration);
    items.push(administration);
    updated = true;
  }

  if (administration.destination !== null || administration.profiles.length !== 1 || administration.profiles[0] !== "Admin") {
    administration.destination = null;
    administration.profiles = ["Admin"];
    updated = true;
  }
  if (!administration.children) {
    administration.children = [];
    updated = true;
  }

  let menuManagement = administration.children.find((item) => item.id === "menu-management");
  if (!menuManagement) {
    menuManagement = structuredClone(requiredMenuManagement);
    administration.children.push(menuManagement);
    updated = true;
  }
  if (menuManagement.destination !== "menu-management" || menuManagement.profiles.length !== 1 || menuManagement.profiles[0] !== "Admin" || menuManagement.children?.length) {
    menuManagement.destination = "menu-management";
    menuManagement.profiles = ["Admin"];
    delete menuManagement.children;
    updated = true;
  }

  return updated;
}

function validateMenu(items: unknown): items is MenuItem[] {
  if (!Array.isArray(items) || items.length > 150) return false;
  const ids = new Set<string>();
  const maxDepth = 5;
  let nodeCount = 0;

  function validateBranch(nodes: unknown[], depth: number, parentProfiles?: MenuProfile[]): boolean {
    if (depth > maxDepth) return false;
    for (const value of nodes) {
      nodeCount += 1;
      if (nodeCount > 150) return false;
      if (!isRecord(value)) return false;
      const { id, label, icon, profiles: itemProfiles, destination, children } = value;
      if (
        typeof id !== "string" ||
        !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id) ||
        ids.has(id) ||
        typeof label !== "string" ||
        !label.trim() ||
        label.trim().length > 50 ||
        typeof icon !== "string" ||
        !icons.has(icon) ||
        !Array.isArray(itemProfiles) ||
        itemProfiles.length === 0 ||
        !itemProfiles.every((profile) => profiles.includes(profile as MenuProfile)) ||
        new Set(itemProfiles).size !== itemProfiles.length ||
        (parentProfiles && !itemProfiles.every((profile) => parentProfiles.includes(profile as MenuProfile))) ||
        (destination !== null && (typeof destination !== "string" || !destinations.has(destination)))
      ) return false;

      const target = destination === null ? null : destinationByValue.get(destination as MenuDestination);
      if (target?.adminOnly && itemProfiles.some((profile) => profile !== "Admin")) return false;
      if (destination === "menu-management" && id !== "menu-management") return false;
      if (id === "menu-management" && (destination !== "menu-management" || itemProfiles.length !== 1 || itemProfiles[0] !== "Admin" || (Array.isArray(children) && children.length > 0))) return false;
      if (id === "administration" && (depth !== 0 || destination !== null || itemProfiles.length !== 1 || itemProfiles[0] !== "Admin")) return false;
      if (children !== undefined && (!Array.isArray(children) || children.length > 150)) return false;
      if (children && children.length > 0 && destination !== null) return false;

      ids.add(id);
      if (children && !validateBranch(children, depth + 1, itemProfiles as MenuProfile[])) return false;
    }
    return true;
  }

  if (!validateBranch(items, 0)) return false;
  const administration = items.find((item) => isRecord(item) && item.id === "administration");
  if (!administration || !Array.isArray(administration.children)) return false;
  return administration.children.some((item: unknown) => isRecord(item) && item.id === "menu-management");
}

export async function GET() {
  const user = await getCurrentSessionUser();
  if (!user) return Response.json({ message: "Sesión no válida." }, { status: 401 });

  try {
    const storedItems = await readJsonEntity<unknown>("menu.json", async () => initialMenu);
    if (!Array.isArray(storedItems)) throw new Error("menu.json debe contener una lista de menús.");
    const items = storedItems.map((item) => normalizeMenuItem(item));
    const requiredItemsUpdated = ensureRequiredMenuItems(items);
    if (!validateMenu(items)) throw new Error("menu.json contiene una estructura de menú no permitida.");
    const normalizedItemsUpdated = JSON.stringify(storedItems) !== JSON.stringify(items);
    if (requiredItemsUpdated || normalizedItemsUpdated) await writeJsonEntity("menu.json", items);

    return Response.json({ items: user.perfil === "Admin" ? items : filterMenu(items, user.perfil) });
  } catch (error) {
    console.error("Menu persistence error:", error);
    return Response.json({ message: "No se pudo leer el menú." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const admin = await getAdminSessionUser();
  if (!admin) return Response.json({ message: "No autorizado." }, { status: 403 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ message: "El cuerpo de la solicitud no es válido." }, { status: 400 });
  }

  if (!isRecord(payload) || !validateMenu(payload.items)) {
    return Response.json({ message: "El árbol del menú contiene datos inválidos o una estructura no permitida." }, { status: 400 });
  }

  try {
    await writeJsonEntity("menu.json", payload.items);
    return Response.json({ items: payload.items });
  } catch (error) {
    console.error("Menu update error:", error);
    return Response.json({ message: "No se pudo guardar el menú." }, { status: 503 });
  }
}
