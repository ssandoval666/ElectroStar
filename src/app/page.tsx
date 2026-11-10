"use client";

import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Clock3,
  FileText,
  GraduationCap,
  House,
  LogOut,
  Menu as MenuIcon,
  Package,
  Search,
  Settings2,
  ShieldCheck,
  UsersRound,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import ProductsAdmin from "@/app/products-admin";
import UsersAdmin from "@/app/users-admin";
import BudgetsAdmin from "@/app/budgets-admin";
import Calendar from "@/app/calendar";
import ClientsHistoryAdmin from "@/app/clients-history-admin";
import WorkOrdersAdmin from "@/app/work-orders-admin";
import type { CalendarEntry } from "@/lib/calendar";
import type { BudgetRecord, ClientRecord } from "@/lib/budgets";
import type { WorkOrderStatus, WorkOrderView } from "@/lib/work-orders";
import MenusAdmin from "@/app/menus-admin";
import type { MenuItem } from "@/lib/menu";

type LoginUser = {
  idusuario: string;
  usuario: string;
  perfil: "Admin" | "Operario";
};

type LoginFeedback = "idle" | "charging" | "success" | "short";
type DashboardMetric = {
  label: string;
  value: string;
  caption: string;
  detail: string;
  icon: LucideIcon;
  alert?: boolean;
};

const currencyFormatter = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const workOrderStatusLabels: Record<WorkOrderStatus, string> = {
  pendiente: "Pendiente",
  programada: "Programada",
  en_curso: "En curso",
  completada: "Completada",
  cancelada: "Cancelada",
};

async function fetchDashboardItems<T>(endpoint: string): Promise<T[]> {
  const response = await fetch(endpoint);
  const result: unknown = await response.json();
  if (!result || typeof result !== "object") {
    throw new Error("El servicio devolvió una respuesta no válida.");
  }

  const body = result as { items?: unknown; message?: unknown };
  if (!response.ok) {
    throw new Error(typeof body.message === "string" ? body.message : "No se pudieron cargar los datos del resumen.");
  }
  if (!Array.isArray(body.items)) {
    throw new Error("El servicio devolvió datos incompletos para el resumen.");
  }
  return body.items as T[];
}

const iconByName: Record<string, LucideIcon> = {
  home: House,
  members: UsersRound,
  services: BriefcaseBusiness,
  calendar: CalendarDays,
  training: GraduationCap,
  forms: ClipboardList,
  profile: BadgeCheck,
  settings: Settings2,
  products: Package,
  briefcase: BriefcaseBusiness,
};
const SESSION_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

export default function Home() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [user, setUser] = useState<LoginUser | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [activeItem, setActiveItem] = useState("resumen");
  const [activeLabel, setActiveLabel] = useState("Resumen");
  const [expandedGroups, setExpandedGroups] = useState<string[]>(["members"]);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginFeedback, setLoginFeedback] = useState<LoginFeedback>("idle");
  const [logoutConfirmationOpen, setLogoutConfirmationOpen] = useState(false);
  const [calendarEntries, setCalendarEntries] = useState<CalendarEntry[]>([]);
  const [dashboardWorkOrders, setDashboardWorkOrders] = useState<WorkOrderView[]>([]);
  const [dashboardBudgets, setDashboardBudgets] = useState<BudgetRecord[]>([]);
  const [dashboardClients, setDashboardClients] = useState<ClientRecord[]>([]);
  const [dashboardError, setDashboardError] = useState("");
  const [dashboardRefresh, setDashboardRefresh] = useState(0);
  const [loadedDashboardKey, setLoadedDashboardKey] = useState("");
  const dashboardKey = user && activeItem === "resumen"
    ? `${user.idusuario}:${user.perfil}:${dashboardRefresh}`
    : "";
  const dashboardLoading = Boolean(dashboardKey && loadedDashboardKey !== dashboardKey);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    setLoginFeedback("charging");

    try {
      const response = await fetch(process.env.NEXT_PUBLIC_LOGIN_ENDPOINT ?? "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.message ?? "No pudimos validar tus datos.");
        setLoginFeedback("short");
        window.setTimeout(() => {
          setLoginFeedback((current) => current === "short" ? "idle" : current);
        }, 1200);
        return;
      }

      const menuResponse = await fetch(process.env.NEXT_PUBLIC_MENU_ENDPOINT ?? "/api/menu");
      if (!menuResponse.ok) {
        throw new Error("No se pudo cargar el menú de la aplicación.");
      }

      const menuResult: { items: MenuItem[] } = await menuResponse.json();
      setLoginFeedback("success");
      await new Promise<void>((resolve) => window.setTimeout(resolve, 700));
      setUser(result.user);
      setMenuItems(menuResult.items);
    } catch {
      setLoginFeedback("idle");
      setError("No pudimos conectar con el servicio. Intentalo nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  function handleLoginFieldChange(update: () => void) {
    update();
    setError("");
    setLoginFeedback("idle");
  }

  function selectMenuItem(item: MenuItem) {
    if (item.destination === null) {
      if (collapsed) setCollapsed(false);
      setExpandedGroups((current) =>
        current.includes(item.id)
          ? current.filter((group) => group !== item.id)
          : [...current, item.id],
      );
      return;
    }

    setActiveItem(item.id);
    setActiveLabel(item.label);
    setMobileMenuOpen(false);
  }

  const logout = useCallback(() => {
    void fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setUser(null);
    setMenuItems([]);
    setUsername("");
    setPassword("");
    setLoginFeedback("idle");
    setError("");
    setLoading(false);
    setLogoutConfirmationOpen(false);
    setActiveItem("resumen");
    setActiveLabel("Resumen");
    setMobileMenuOpen(false);
    setCalendarEntries([]);
    setDashboardWorkOrders([]);
    setDashboardBudgets([]);
    setDashboardClients([]);
    setDashboardError("");
    setLoadedDashboardKey("");
  }, []);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        const sessionResponse = await fetch("/api/auth/session");
        if (!sessionResponse.ok) return;

        const sessionResult: { user: LoginUser } = await sessionResponse.json();
        const menuResponse = await fetch(process.env.NEXT_PUBLIC_MENU_ENDPOINT ?? "/api/menu");
        if (!menuResponse.ok) return;

        const menuResult: { items: MenuItem[] } = await menuResponse.json();
        if (active) {
          setUser(sessionResult.user);
          setMenuItems(menuResult.items);
        }
      } catch {
        if (active) setError("No se pudo restaurar la sesión.");
      }
    }

    void restoreSession();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user) return;

    const configuredMinutes = Number(process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES ?? "3");
    const idleTimeoutMs = Number.isFinite(configuredMinutes) && configuredMinutes > 0
      ? configuredMinutes * 60_000
      : 3 * 60_000;
    const activityEvents = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart", "click"] as const;
    let timerId: number;

    const resetIdleTimer = () => {
      window.clearTimeout(timerId);
      timerId = window.setTimeout(logout, idleTimeoutMs);
    };

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, resetIdleTimer, { passive: true });
    });
    resetIdleTimer();

    return () => {
      window.clearTimeout(timerId);
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, resetIdleTimer);
      });
    };
  }, [user, logout]);

  useEffect(() => {
    if (!user) return;

    const refreshSession = async () => {
      try {
        const response = await fetch("/api/auth/session");
        if (response.status === 401) {
          logout();
          return;
        }
        if (!response.ok) return;

        const result: { user: LoginUser } = await response.json();
        setUser(result.user);
      } catch {
        return;
      }
    };

    const intervalId = window.setInterval(() => void refreshSession(), SESSION_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [user, logout]);

  useEffect(() => {
    const currentUser = user;
    if (!currentUser || activeItem !== "resumen") return;
    let active = true;
    const requestKey = `${currentUser.idusuario}:${currentUser.perfil}:${dashboardRefresh}`;
    const userProfile = currentUser.perfil;

    async function loadDashboard() {
      try {
        let workOrders: WorkOrderView[];
        let entries: CalendarEntry[];
        let budgets: BudgetRecord[] = [];
        let clients: ClientRecord[] = [];
        if (userProfile === "Admin") {
          [workOrders, entries, budgets, clients] = await Promise.all([
            fetchDashboardItems<WorkOrderView>("/api/work-orders"),
            fetchDashboardItems<CalendarEntry>("/api/calendar"),
            fetchDashboardItems<BudgetRecord>("/api/budgets"),
            fetchDashboardItems<ClientRecord>("/api/clients"),
          ]);
        } else {
          [workOrders, entries] = await Promise.all([
            fetchDashboardItems<WorkOrderView>("/api/work-orders"),
            fetchDashboardItems<CalendarEntry>("/api/calendar"),
          ]);
        }
        if (!active) return;
        setDashboardWorkOrders(workOrders);
        setCalendarEntries(entries);
        setDashboardBudgets(budgets);
        setDashboardClients(clients);
        setDashboardError("");
        setLoadedDashboardKey(requestKey);
      } catch (loadError) {
        if (!active) return;
        setDashboardWorkOrders([]);
        setCalendarEntries([]);
        setDashboardBudgets([]);
        setDashboardClients([]);
        setDashboardError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los datos del resumen.");
        setLoadedDashboardKey(requestKey);
      }
    }

    void loadDashboard();

    return () => { active = false; };
  }, [user, activeItem, dashboardRefresh]);

  if (!user) {
    return (
      <main className={`login-shell login-state-${loginFeedback}`}>
        <section className="login-panel">
          <div className="login-form-wrap">
            <div className="form-heading">
              <span className="eyebrow">PORTAL ELECTROSTAR</span>
              <h2>Tu espacio,</h2>
              <h2 className="heading-light">más cerca.</h2>
              <p>Ingresá para gestionar tus servicios y beneficios.</p>
            </div>

            <form className="login-form" onSubmit={handleLogin}>
              <label className="field-label" htmlFor="username">Usuario</label>
              <div className="input-wrap">
                <UsersRound size={17} aria-hidden="true" />
                <input
                  autoComplete="username"
                  disabled={loading}
                  id="username"
                  name="username"
                  onChange={(event) => handleLoginFieldChange(() => setUsername(event.target.value))}
                  placeholder="Tu número de afiliado"
                  required
                  value={username}
                />
              </div>

              <div className="password-label-row">
                <label className="field-label" htmlFor="password">Contraseña</label>
                <button className="text-button" onClick={() => setShowPassword((visible) => !visible)} type="button">
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              <div className="input-wrap">
                <ShieldCheck size={17} aria-hidden="true" />
                <input
                  autoComplete="current-password"
                  disabled={loading}
                  id="password"
                  name="password"
                  onChange={(event) => handleLoginFieldChange(() => setPassword(event.target.value))}
                  placeholder="Ingresá tu contraseña"
                  required
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
              </div>

              {error && <p className="form-error" role="alert">{error}</p>}

              <button className="login-submit" disabled={loading || loginFeedback === "short"} type="submit">
                <span>{loginFeedback === "charging" ? "Verificando acceso..." : loginFeedback === "success" ? "Acceso correcto" : loginFeedback === "short" ? "Acceso rechazado" : "Ingresar al portal"}</span>
                {loginFeedback === "idle"
                  ? <ArrowUpRight aria-hidden="true" size={18} />
                  : <svg aria-hidden="true" className="login-circuit-art" fill="none" viewBox="0 0 330 64">
                    <path className="circuit-base" d="M8 32h92l20-20h76l20 20h40" />
                    <path className="circuit-current" d="M8 32h92l20-20h76l20 20h40" pathLength="1" />
                    <circle className="circuit-node" cx="8" cy="32" r="3" />
                    <circle className="circuit-node" cx="100" cy="32" r="3" />
                    <circle className="circuit-node" cx="256" cy="32" r="3" />
                    <path className="circuit-spark" d="m151 2-8 12 9 2-8 13 18-17-10-1 7-9" />
                    <path className="circuit-bulb" d="M302 14a18 18 0 0 0-10 33v5h20v-5a18 18 0 0 0-10-33Z" />
                    <path className="circuit-filament" d="m298 27-4 7h6l-3 7 9-10h-6l3-4" />
                    <path className="circuit-bulb-base" d="M294 56h16m-13 4h10" />
                  </svg>}
              </button>
            </form>            
          </div>

          <div className="login-panel-foot">
            <span>¿Necesitás ayuda?</span>
            <a href="mailto:ayuda@electrostar.org">Contactá con soporte</a>
            <span className="copyright">© 2026 ElectroStar</span>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      {mobileMenuOpen && (
        <button aria-label="Cerrar menú" className="sidebar-scrim" onClick={() => setMobileMenuOpen(false)} type="button" />
      )}
      <aside className={`sidebar ${collapsed ? "sidebar-collapsed" : ""} ${mobileMenuOpen ? "sidebar-mobile-open" : ""}`}>
        <div className="sidebar-brand-row">
          <Brand compact={collapsed} light />
          <button
            aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
            className="collapse-button"
            onClick={() => setCollapsed((value) => !value)}
            title={collapsed ? "Expandir menú" : "Contraer menú"}
            type="button"
          >
            {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          </button>
          <button aria-label="Cerrar menú" className="mobile-close" onClick={() => setMobileMenuOpen(false)} type="button">
            <X size={19} />
          </button>
        </div>

        <div className="sidebar-member">
          <div className="member-avatar">{user.usuario.slice(0, 1).toUpperCase()}</div>
          {!collapsed && <div className="member-copy"><strong>{user.usuario}</strong><span>{user.perfil}</span></div>}
        </div>

        <nav aria-label="Navegación principal" className="sidebar-nav">
          <span className="nav-section-label">{!collapsed && "MI ESPACIO"}</span>
          <button
            className={`nav-item ${activeItem === "resumen" ? "nav-item-active" : ""}`}
            onClick={() => {
              setActiveItem("resumen");
              setActiveLabel("Resumen");
              setMobileMenuOpen(false);
            }}
            title="Resumen"
            type="button"
          >
            <House size={18} />
            {!collapsed && <span>Resumen</span>}
            {!collapsed && activeItem === "resumen" && <span className="nav-active-mark" />}
          </button>
          {menuItems.map((item) => (
            <MenuBranch
              activeItem={activeItem}
              collapsed={collapsed}
              expandedGroups={expandedGroups}
              item={item}
              key={item.id}
              level={0}
              onSelect={selectMenuItem}
              setActiveItem={(id, label) => {
                setActiveItem(id);
                setActiveLabel(label);
                setMobileMenuOpen(false);
              }}
            />
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="nav-item logout-item" onClick={() => setLogoutConfirmationOpen(true)} title="Cerrar sesión" type="button"><LogOut size={18} />{!collapsed && <span>Cerrar sesión</span>}</button>
          {!collapsed && <div className="sidebar-footer-mark"><span>ENERGÍA QUE NOS UNE</span><span>v1.0.0 · 2026</span></div>}
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button aria-label="Abrir menú" className="mobile-menu-button" onClick={() => { setCollapsed(false); setMobileMenuOpen(true); }} type="button"><MenuIcon size={20} /></button>
            <div className="breadcrumb"><span>Mi espacio</span><ChevronRight size={14} /><strong>{activeLabel}</strong></div>
          </div>
          <div className="topbar-actions">
            <span className="topbar-date">{new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "2-digit", month: "short", year: "numeric" }).format(new Date()).toLocaleUpperCase("es-AR")}</span>
            <button aria-label="Buscar" className="icon-button" type="button"><Search size={18} /></button>
            <button aria-label="Notificaciones" className="icon-button notification-button" type="button"><Bell size={18} /><span /></button>
            <div className="topbar-avatar">{user.usuario.slice(0, 1).toUpperCase()}</div>
          </div>
        </header>

        <div className="dashboard-content">
          {activeItem === "menu-management" && user.perfil === "Admin" ? <MenusAdmin onSaved={setMenuItems} /> : activeItem === "users" && user.perfil === "Admin" ? <UsersAdmin /> : activeItem === "products" && user.perfil === "Admin" ? <ProductsAdmin /> : activeItem === "budgets" && user.perfil === "Admin" ? <BudgetsAdmin /> : activeItem === "clients" && user.perfil === "Admin" ? <ClientsHistoryAdmin /> : activeItem === "work-orders" ? <WorkOrdersAdmin isAdmin={user.perfil === "Admin"} /> : activeItem === "calendar" ? <Calendar /> : (
            <>
          {(() => {
            const now = new Date();
            const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
            const currentMonth = today.slice(0, 7);
            const workOrders = dashboardLoading ? [] : dashboardWorkOrders;
            const budgets = dashboardLoading ? [] : dashboardBudgets;
            const clients = dashboardLoading ? [] : dashboardClients;
            const entries = dashboardLoading ? [] : calendarEntries;
            const sevenDaysFromNow = new Date(now);
            sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
            const endOfWindow = `${sevenDaysFromNow.getFullYear()}-${String(sevenDaysFromNow.getMonth() + 1).padStart(2, "0")}-${String(sevenDaysFromNow.getDate()).padStart(2, "0")}`;
            const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
            const isOpenOrder = (order: WorkOrderView) => order.estado !== "completada" && order.estado !== "cancelada";
            const activeOrders = workOrders.filter(isOpenOrder);
            const overdueOrders = activeOrders.filter((order) => order.fecha_programada && order.fecha_programada < today);
            const upcomingWorkOrders = activeOrders
              .filter((order) => order.fecha_programada >= today && order.fecha_programada <= endOfWindow)
              .sort((left, right) => left.fecha_programada.localeCompare(right.fecha_programada));
            const todayOrders = upcomingWorkOrders.filter((order) => order.fecha_programada === today);
            const upcomingEntries = [...entries]
              .filter((entry) => entry.fecha > today || (entry.fecha === today && entry.hora >= currentTime))
              .sort((left, right) => `${left.fecha} ${left.hora}`.localeCompare(`${right.fecha} ${right.hora}`));
            const formatDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "short", timeZone: "UTC" }).replace(".", "").toLocaleUpperCase("es-AR");
            const changePage = (id: string, label: string) => {
              setActiveItem(id);
              setActiveLabel(label);
              setMobileMenuOpen(false);
            };
            const metrics: DashboardMetric[] = user.perfil === "Admin"
              ? (() => {
                const sentBudgets = budgets.filter((budget) => budget.estado === "enviado");
                const expiredBudgets = budgets.filter((budget) =>
                  (budget.estado === "borrador" || budget.estado === "enviado") &&
                  Boolean(budget.vigente_hasta) &&
                  budget.vigente_hasta! < today,
                );
                const acceptedThisMonth = budgets.filter((budget) =>
                  budget.estado === "aceptado" && budget.fecha.startsWith(currentMonth),
                );
                const acceptedValue = acceptedThisMonth.reduce((sum, budget) => sum + budget.total, 0);
                return [
                  { label: "ÓRDENES ACTIVAS", value: String(activeOrders.length), caption: "Pendientes, programadas o en curso", detail: "Trabajos abiertos", icon: Activity },
                  { label: "ÓRDENES ATRASADAS", value: String(overdueOrders.length), caption: "Fecha programada ya vencida", detail: overdueOrders.length ? "Requieren atención" : "Sin atrasos", icon: AlertTriangle, alert: overdueOrders.length > 0 },
                  { label: "PRESUPUESTOS ENVIADOS", value: String(sentBudgets.length), caption: "Pendientes de respuesta", detail: currencyFormatter.format(sentBudgets.reduce((sum, budget) => sum + budget.total, 0)), icon: FileText },
                  { label: "TRABAJOS PRÓXIMOS", value: String(upcomingWorkOrders.length), caption: "Programados para los próximos 7 días", detail: `${todayOrders.length} para hoy`, icon: CalendarDays },
                  { label: "CLIENTES", value: String(clients.length), caption: "Clientes registrados", detail: "Cartera total", icon: UsersRound },
                  { label: "ACEPTADOS ESTE MES", value: currencyFormatter.format(acceptedValue), caption: "Valor presupuestado, no cobrado", detail: `${acceptedThisMonth.length} presupuestos · ${expiredBudgets.length} vencidos`, icon: BadgeCheck, alert: expiredBudgets.length > 0 },
                ];
              })()
              : [
                { label: "MIS PENDIENTES", value: String(activeOrders.filter((order) => order.estado === "pendiente" || order.estado === "programada").length), caption: "Órdenes asignadas por atender", detail: "Pendientes o programadas", icon: ClipboardList },
                { label: "EN CURSO", value: String(activeOrders.filter((order) => order.estado === "en_curso").length), caption: "Trabajos que ya comenzaron", detail: "Órdenes asignadas", icon: Activity },
                { label: "PARA HOY", value: String(todayOrders.length), caption: "Órdenes programadas para hoy", detail: todayOrders.length ? "Revisá la agenda del día" : "No hay trabajos para hoy", icon: CalendarDays },
                { label: "PRÓXIMOS 7 DÍAS", value: String(upcomingWorkOrders.length), caption: "Trabajos asignados con fecha", detail: "Incluye los trabajos de hoy", icon: Clock3 },
              ];
            const adminAlerts = user.perfil === "Admin"
              ? [
                ...(overdueOrders.length ? [{ title: `${overdueOrders.length} órdenes atrasadas`, detail: "Revisá su estado y programación.", icon: AlertTriangle, color: "quick-icon-coral", destination: "work-orders", label: "Órdenes de trabajo" }] : []),
                ...(() => {
                  const pendingCount = budgets.filter((budget) => budget.estado === "enviado").length;
                  return pendingCount ? [{ title: `${pendingCount} presupuestos enviados`, detail: "Esperan una respuesta del cliente.", icon: FileText, color: "quick-icon-yellow", destination: "budgets", label: "Presupuestos" }] : [];
                })(),
                ...(() => {
                  const unassignedCount = activeOrders.filter((order) => !order.usuario_asignado).length;
                  return unassignedCount ? [{ title: `${unassignedCount} órdenes sin asignar`, detail: "Todavía no tienen un técnico asignado.", icon: UsersRound, color: "quick-icon-yellow", destination: "work-orders", label: "Órdenes de trabajo" }] : [];
                })(),
                ...(() => {
                  const expiredCount = budgets.filter((budget) =>
                    (budget.estado === "borrador" || budget.estado === "enviado") &&
                    Boolean(budget.vigente_hasta) &&
                    budget.vigente_hasta! < today,
                  ).length;
                  return expiredCount ? [{ title: `${expiredCount} presupuestos vencidos`, detail: "Su vigencia ya finalizó.", icon: Clock3, color: "quick-icon-coral", destination: "budgets", label: "Presupuestos" }] : [];
                })(),
              ]
              : [];
            const nowLabel = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(now).toLocaleUpperCase("es-AR");

            return (
              <>
                <div className="page-intro">
                  <div>
                    <span className="eyebrow">{nowLabel}</span>
                    <h1>Buen día,</h1>
                    <h1 className="intro-name">{user.usuario}.</h1>
                    <p>{user.perfil === "Admin" ? "Vista general de clientes, presupuestos y servicios." : "Tus trabajos asignados y la agenda de servicios."}</p>
                  </div>
                  <button className="outline-action" onClick={() => changePage("calendar", "Agenda")} type="button"><CalendarDays size={16} /><span>Ver calendario</span><ArrowUpRight size={15} /></button>
                </div>

                {dashboardError && !dashboardLoading && <p className="users-message users-message-error" role="alert">{dashboardError} <button className="panel-link" onClick={() => { setDashboardError(""); setDashboardRefresh((value) => value + 1); }} type="button">Reintentar</button></p>}
                {dashboardLoading && <p className="history-loading" role="status">Actualizando indicadores...</p>}

                <section aria-busy={dashboardLoading} aria-label="Indicadores de gestión" className="stats-grid">
                  {metrics.map((metric) => (
                    <article className="stat-panel" key={metric.label}>
                      <div className="stat-topline"><span>{metric.label}</span><metric.icon size={17} /></div>
                      <strong className={`stat-value${metric.alert ? " stat-value-alert" : ""}`}>{metric.value}</strong>
                      <span className="stat-caption">{metric.caption}</span>
                      <span className={`stat-trend${metric.alert ? " trend-alert" : ""}`}><Activity size={13} /> {metric.detail}</span>
                    </article>
                  ))}
                </section>

                <section className="lower-grid">
                  <article className="activity-panel">
                    <div className="panel-heading">
                      <div><span className="eyebrow">OPERACIÓN</span><h2>Próximos trabajos</h2></div>
                      <button className="panel-link" onClick={() => changePage("work-orders", "Órdenes de trabajo")} type="button">Ver órdenes <ArrowUpRight size={14} /></button>
                    </div>
                    {upcomingWorkOrders.slice(0, 5).map((order) => {
                      const [day, month] = formatDate(order.fecha_programada).split(" ");
                      const clientName = order.cliente ? `${order.cliente.nombre} ${order.cliente.apellido}` : "Cliente no disponible";
                      return (
                        <button className="event-row event-row-button" key={order.id} onClick={() => changePage("work-orders", "Órdenes de trabajo")} type="button">
                          <span className="event-date event-date-green"><strong>{day}</strong><span>{month}</span></span>
                          <span className="event-details"><strong>{order.descripcion}</strong><span>{clientName} · {order.direccion || "Sin dirección"}</span></span>
                          <span className="event-type event-type-green">{workOrderStatusLabels[order.estado]}</span><ChevronRight className="event-chevron" size={17} />
                        </button>
                      );
                    })}
                    {!upcomingWorkOrders.length && <p className="calendar-empty-summary">{dashboardLoading ? "Cargando trabajos..." : "No hay trabajos programados para los próximos 7 días."}</p>}
                  </article>

                  <article className="quick-panel">
                    <div className="panel-heading">
                      <div><span className="eyebrow">{user.perfil === "Admin" ? "SEGUIMIENTO" : "AGENDA"}</span><h2>{user.perfil === "Admin" ? "Alertas y agenda" : "Próximas actividades"}</h2></div>
                      <button className="panel-link" onClick={() => changePage("calendar", "Agenda")} type="button">Agenda <ArrowUpRight size={14} /></button>
                    </div>
                    {adminAlerts.map((alert) => (
                      <button className="quick-link" key={alert.title} onClick={() => changePage(alert.destination, alert.label)} type="button">
                        <span className={`quick-icon ${alert.color}`}><alert.icon size={16} /></span>
                        <span><strong>{alert.title}</strong><small>{alert.detail}</small></span>
                        <ChevronRight size={15} />
                      </button>
                    ))}
                    {upcomingEntries.slice(0, user.perfil === "Admin" ? 2 : 4).map((entry) => (
                      <button className="quick-link" key={entry.id} onClick={() => changePage("calendar", "Agenda")} type="button">
                        <span className="quick-icon quick-icon-green"><CalendarDays size={16} /></span>
                        <span><strong>{entry.descripcion}</strong><small>{formatDate(entry.fecha)} · {entry.hora}</small></span>
                        <ChevronRight size={15} />
                      </button>
                    ))}
                    {!dashboardLoading && !adminAlerts.length && !upcomingEntries.length && <p className="calendar-empty-summary">No hay alertas ni actividades próximas.</p>}
                  </article>
                </section>
              </>
            );
          })()}

          <footer className="dashboard-footer"><span>HECHO PARA QUIENES MANTIENEN TODO EN MARCHA.</span><span>ELECTROSTAR <span className="footer-star">✳</span> 2026</span></footer>
            </>
          )}
        </div>
      </section>
      {logoutConfirmationOpen && <div className="users-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setLogoutConfirmationOpen(false); }}>
        <section
          aria-describedby="logout-confirmation-description"
          aria-labelledby="logout-confirmation-title"
          aria-modal="true"
          className="users-modal"
          onKeyDown={(event) => {
            if (event.key === "Escape") setLogoutConfirmationOpen(false);
          }}
          role="alertdialog"
          tabIndex={-1}
        >
          <header className="users-modal-heading modal-heading-warning">
            <div><h2 id="logout-confirmation-title">¿Cerrar sesión?</h2><p id="logout-confirmation-description">Vas a salir de tu cuenta de ElectroStar.</p></div>
          </header>
          <div className="delete-confirmation">
            <div className="user-editor-actions">
              <button autoFocus className="users-cancel-button" onClick={() => setLogoutConfirmationOpen(false)} type="button">Seguir en el portal</button>
              <button className="users-confirm-delete" onClick={logout} type="button">Cerrar sesión</button>
            </div>
          </div>
        </section>
      </div>}
    </main>
  );
}

function Brand({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <div className={`brand ${light ? "brand-light" : ""}`}>
      <span className="brand-symbol"><Zap size={19} fill="currentColor" /></span>
      {!compact && <span className="brand-wordmark">ELECTRO<span>STAR</span></span>}
    </div>
  );
}

function MenuBranch({
  activeItem,
  collapsed,
  expandedGroups,
  item,
  level,
  onSelect,
  setActiveItem,
}: {
  activeItem: string;
  collapsed: boolean;
  expandedGroups: string[];
  item: MenuItem;
  level: number;
  onSelect: (item: MenuItem) => void;
  setActiveItem: (id: string, label: string) => void;
}) {
  const Icon = iconByName[item.icon] ?? CircleHelp;
  const hasChildren = item.destination === null;
  const expanded = expandedGroups.includes(item.id);
  const active = activeItem === (item.destination ?? item.id);

  return (
    <div className="menu-branch">
      <button
        aria-expanded={hasChildren ? expanded : undefined}
        className={`nav-item ${active ? "nav-item-active" : ""} ${level ? "nav-subitem" : ""}`}
        onClick={() => hasChildren ? onSelect(item) : setActiveItem(item.destination ?? item.id, item.label)}
        style={{ "--nav-level": level } as CSSProperties}
        title={item.label}
        type="button"
      >
        <Icon size={18} />
        {!collapsed && <span>{item.label}</span>}
        {!collapsed && hasChildren && <ChevronDown className={`nav-chevron ${expanded ? "nav-chevron-open" : ""}`} size={15} />}
        {!collapsed && active && !hasChildren && <span className="nav-active-mark" />}
      </button>
      {!collapsed && expanded && item.children?.map((child) => (
        <MenuBranch
          activeItem={activeItem}
          collapsed={collapsed}
          expandedGroups={expandedGroups}
          item={child}
          key={child.id}
          level={level + 1}
          onSelect={onSelect}
          setActiveItem={setActiveItem}
        />
      ))}
    </div>
  );
}