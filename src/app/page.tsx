"use client";

import {
  Activity,
  ArrowDownRight,
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

type MenuItem = {
  id: string;
  label: string;
  icon: string;
  children?: MenuItem[];
};

type LoginUser = {
  idusuario: string;
  usuario: string;
  perfil: "Admin" | "Operario";
};

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
  const [calendarEntries, setCalendarEntries] = useState<CalendarEntry[]>([]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(process.env.NEXT_PUBLIC_LOGIN_ENDPOINT ?? "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.message ?? "No pudimos validar tus datos.");
        return;
      }

      const menuResponse = await fetch(process.env.NEXT_PUBLIC_MENU_ENDPOINT ?? "/api/menu");
      if (!menuResponse.ok) {
        throw new Error("No se pudo cargar el menú de la aplicación.");
      }

      const menuResult: { items: MenuItem[] } = await menuResponse.json();
      setUser(result.user);
      setMenuItems(menuResult.items);
    } catch {
      setError("No pudimos conectar con el servicio. Intentalo nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  function selectMenuItem(item: MenuItem) {
    if (item.children?.length) {
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
    setActiveItem("resumen");
    setActiveLabel("Resumen");
    setMobileMenuOpen(false);
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
    if (!user || activeItem !== "resumen") return;
    let active = true;

    fetch("/api/calendar")
      .then(async (response) => {
        if (!response.ok) throw new Error("No se pudo cargar la agenda.");
        return response.json() as Promise<{ items: CalendarEntry[] }>;
      })
      .then((result) => { if (active) setCalendarEntries(result.items); })
      .catch(() => { if (active) setCalendarEntries([]); });

    return () => { active = false; };
  }, [user, activeItem]);

  if (!user) {
    return (
      <main className="login-shell">
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
                  id="username"
                  name="username"
                  onChange={(event) => setUsername(event.target.value)}
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
                  id="password"
                  name="password"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Ingresá tu contraseña"
                  required
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
              </div>

              {error && <p className="form-error" role="alert">{error}</p>}

              <button className="login-submit" disabled={loading} type="submit">
                <span>{loading ? "Validando acceso..." : "Ingresar al portal"}</span>
                <ArrowUpRight size={18} aria-hidden="true" />
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
          <button className="nav-item logout-item" onClick={logout} title="Cerrar sesión" type="button"><LogOut size={18} />{!collapsed && <span>Cerrar sesión</span>}</button>
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
            <span className="topbar-date">LUNES, 26 OCT 2026</span>
            <button aria-label="Buscar" className="icon-button" type="button"><Search size={18} /></button>
            <button aria-label="Notificaciones" className="icon-button notification-button" type="button"><Bell size={18} /><span /></button>
            <div className="topbar-avatar">{user.usuario.slice(0, 1).toUpperCase()}</div>
          </div>
        </header>

        <div className="dashboard-content">
          {activeItem === "users" && user.perfil === "Admin" ? <UsersAdmin /> : activeItem === "products" && user.perfil === "Admin" ? <ProductsAdmin /> : activeItem === "budgets" && user.perfil === "Admin" ? <BudgetsAdmin /> : activeItem === "clients" && user.perfil === "Admin" ? <ClientsHistoryAdmin /> : activeItem === "work-orders" ? <WorkOrdersAdmin isAdmin={user.perfil === "Admin"} /> : activeItem === "calendar" ? <Calendar /> : (
            <>
          <div className="page-intro">
            <div>
              <span className="eyebrow">LUNES · 26 DE OCTUBRE DE 2026</span>
              <h1>{activeItem === "resumen" ? "Buen día," : activeLabel}</h1>
              {activeItem === "resumen" && <h1 className="intro-name">{user.usuario}.</h1>}
              <p>{activeItem === "resumen" ? "Todo lo que necesitás para seguir conectado a tu comunidad." : `Consultá y gestioná ${activeLabel.toLocaleLowerCase()} desde tu espacio de afiliado.`}</p>
            </div>
            <button className="outline-action" onClick={() => { setActiveItem("calendar"); setActiveLabel("Agenda"); }} type="button"><CalendarDays size={16} /><span>Ver calendario</span><ArrowUpRight size={15} /></button>
          </div>

          {(() => {
            const now = new Date();
            const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
            const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
            const upcomingEntries = [...calendarEntries]
              .filter((entry) => entry.fecha > today || (entry.fecha === today && entry.hora >= currentTime))
              .sort((left, right) => `${left.fecha} ${left.hora}`.localeCompare(`${right.fecha} ${right.hora}`));
            const nextEntry = upcomingEntries[0];
            const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "short" }).replace(".", "").toUpperCase();
            const daysUntil = nextEntry ? Math.max(0, Math.ceil((new Date(`${nextEntry.fecha}T${nextEntry.hora}:00`).getTime() - now.getTime()) / 86_400_000)) : 0;

            return (
              <>
                <section aria-label="Indicadores de afiliación" className="stats-grid">
                  <article className="stat-panel">
                    <div className="stat-topline"><span>PRÓXIMA ACTIVIDAD</span><CalendarDays size={17} /></div>
                    {nextEntry ? <>
                      <strong className="stat-value">{dateLabel(nextEntry.fecha).split(" ")[0]} <small>{dateLabel(nextEntry.fecha).split(" ")[1]}</small></strong>
                      <span className="stat-caption">{nextEntry.descripcion}</span>
                      <span className="stat-trend"><Clock3 size={13} /> {daysUntil === 0 ? `Hoy · ${nextEntry.hora}` : `En ${daysUntil} ${daysUntil === 1 ? "día" : "días"}`}</span>
                    </> : <>
                      <strong className="stat-value">-- <small>---</small></strong>
                      <span className="stat-caption">No hay actividades próximas</span>
                      <span className="stat-trend"><Clock3 size={13} /> Tu agenda está al día</span>
                    </>}
                  </article>
                </section>

                <section className="lower-grid">
                  <article className="activity-panel">
                    <div className="panel-heading">
                      <div><span className="eyebrow">TU COMUNIDAD</span><h2>Lo que se viene</h2></div>
                      <button className="panel-link" onClick={() => { setActiveItem("calendar"); setActiveLabel("Agenda"); }} type="button">Ver agenda <ArrowUpRight size={14} /></button>
                    </div>
                    {upcomingEntries.slice(0, 3).map((entry) => {
                      const [day, month] = dateLabel(entry.fecha).split(" ");
                      return (
                        <button className="event-row event-row-button" key={entry.id} onClick={() => { setActiveItem("calendar"); setActiveLabel("Agenda"); }} type="button">
                          <span className="event-date"><strong>{day}</strong><span>{month}</span></span>
                          <span className="event-details"><strong>{entry.descripcion}</strong><span><Clock3 size={13} /> {entry.hora} · {entry.duracion} min</span></span>
                          <span className="event-type">ACTIVIDAD</span><ChevronRight className="event-chevron" size={17} />
                        </button>
                      );
                    })}
                    {upcomingEntries.length === 0 && <p className="calendar-empty-summary">Todavía no hay actividades próximas en tu agenda.</p>}
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
  const hasChildren = Boolean(item.children?.length);
  const expanded = expandedGroups.includes(item.id);
  const active = activeItem === item.id;

  return (
    <div className="menu-branch">
      <button
        aria-expanded={hasChildren ? expanded : undefined}
        className={`nav-item ${active ? "nav-item-active" : ""} ${level ? "nav-subitem" : ""}`}
        onClick={() => hasChildren ? onSelect(item) : setActiveItem(item.id, item.label)}
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