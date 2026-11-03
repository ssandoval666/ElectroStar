import { getCurrentSessionUser } from "@/lib/session";
import { readJsonEntity, writeJsonEntity } from "@/lib/drive-json-store";

type MenuItem = {
  id: string;
  label: string;
  icon: string;
  profiles?: string[];
  children?: MenuItem[];
};

const initialMenu: MenuItem[] = [  
  { id: "calendar", label: "Agenda", icon: "calendar" },
  { id: "budgets", label: "Presupuestos", icon: "forms", profiles: ["Admin"] },
  {
    id: "administration",
    label: "Administración",
    icon: "settings",
    profiles: ["Admin"],
    children: [
      { id: "users", label: "Usuarios", icon: "members", profiles: ["Admin"] },
      { id: "products", label: "Productos", icon: "products", profiles: ["Admin"] }
      
    ],
  },
];

function filterMenu(items: MenuItem[], profile: string): MenuItem[] {
  return items.flatMap((item) => {
    if (item.profiles && !item.profiles.includes(profile)) return [];
    const children = item.children ? filterMenu(item.children, profile) : undefined;
    if (item.children && !children?.length) return [];
    return [{ ...item, ...(children ? { children } : {}) }];
  });
}

export async function GET() {
  const user = await getCurrentSessionUser();
  if (!user) return Response.json({ message: "Sesión no válida." }, { status: 401 });

  try {
    const items = await readJsonEntity("menu.json", async () => initialMenu);
    const initialAdministration = initialMenu[initialMenu.length - 1];
    const existingAdministration = items.find((item) => item.id === "administration");
    let menuUpdated = false;
    if (!existingAdministration) {
      items.push(initialAdministration);
      menuUpdated = true;
    } else {
      const requiredChildren = initialAdministration.children ?? [];
      const existingChildren = existingAdministration.children ?? [];
      const missingChildren = requiredChildren.filter((child) => !existingChildren.some((existing) => existing.id === child.id));
      if (missingChildren.length) {
        existingAdministration.children = [...existingChildren, ...missingChildren];
        menuUpdated = true;
      }
    }
    if (menuUpdated) {
      await writeJsonEntity("menu.json", items);
    }
    return Response.json({ items: filterMenu(items, user.perfil) });
  } catch (error) {
    console.error("Menu persistence error:", error);
    return Response.json({ message: "No se pudo leer el menú." }, { status: 503 });
  }
}