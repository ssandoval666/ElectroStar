export type MenuProfile = string;

export type MenuDestination =
  | "calendar"
  | "budgets"
  | "work-orders"
  | "clients"
  | "users"
  | "products"
  | "menu-management"
  | "profile-management";

export type MenuItem = {
  id: string;
  label: string;
  icon: string;
  profiles: MenuProfile[];
  destination: MenuDestination | null;
  children?: MenuItem[];
};

export const menuIcons = [
  { value: "calendar", label: "Calendario" },
  { value: "forms", label: "Formularios" },
  { value: "briefcase", label: "Maletín" },
  { value: "members", label: "Personas" },
  { value: "products", label: "Productos" },
  { value: "settings", label: "Configuración" },
  { value: "home", label: "Inicio" },
] as const;

export const menuDestinations: { value: MenuDestination; label: string; adminOnly?: boolean }[] = [
  { value: "calendar", label: "Agenda" },
  { value: "work-orders", label: "Órdenes de trabajo" },
  { value: "budgets", label: "Presupuestos", adminOnly: true },
  { value: "clients", label: "Clientes", adminOnly: true },
  { value: "users", label: "Usuarios", adminOnly: true },
  { value: "products", label: "Productos", adminOnly: true },
  { value: "menu-management", label: "Administración de menús", adminOnly: true },
  { value: "profile-management", label: "Administración de perfiles", adminOnly: true },
];

export const initialMenu: MenuItem[] = [
  { id: "calendar", label: "Agenda", icon: "calendar", profiles: ["Admin", "Operario"], destination: "calendar" },
  { id: "budgets", label: "Presupuestos", icon: "forms", profiles: ["Admin"], destination: "budgets" },
  { id: "work-orders", label: "Órdenes de trabajo", icon: "briefcase", profiles: ["Admin", "Operario"], destination: "work-orders" },
  { id: "clients", label: "Clientes", icon: "members", profiles: ["Admin"], destination: "clients" },
  {
    id: "administration",
    label: "Administración",
    icon: "settings",
    profiles: ["Admin"],
    destination: null,
    children: [
      { id: "users", label: "Usuarios", icon: "members", profiles: ["Admin"], destination: "users" },
      { id: "products", label: "Productos", icon: "products", profiles: ["Admin"], destination: "products" },
      { id: "menu-management", label: "Menús", icon: "settings", profiles: ["Admin"], destination: "menu-management" },
      { id: "profile-management", label: "Perfiles", icon: "settings", profiles: ["Admin"], destination: "profile-management" },
    ],
  },
];
