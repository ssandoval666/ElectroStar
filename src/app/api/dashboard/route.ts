import { getCurrentSessionUser } from "@/lib/session";
import { readJsonEntity } from "@/lib/drive-json-store";
import type { BudgetRecord, ClientRecord } from "@/lib/budgets";
import type { CalendarEntry } from "@/lib/calendar";
import { ensureWorkOrdersForBudgets, type WorkOrder } from "@/lib/work-orders";
import type { DashboardSummary } from "@/lib/dashboard";

function isValidDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function getLocalDateTime() {
  const now = new Date();
  return {
    date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
  };
}

export async function GET(request: Request) {
  const user = await getCurrentSessionUser();
  if (!user) return Response.json({ message: "Sesión no válida." }, { status: 401 });

  const requestedDate = new URL(request.url).searchParams.get("date");
  const requestedTime = new URL(request.url).searchParams.get("time");
  const localDateTime = getLocalDateTime();
  const today = requestedDate ?? localDateTime.date;
  const currentTime = requestedTime ?? localDateTime.time;
  if (!isValidDate(today) || !isValidTime(currentTime)) {
    return Response.json({ message: "La fecha u hora del resumen no es válida." }, { status: 400 });
  }

  try {
    const [budgets, clients, storedWorkOrders, entries] = await Promise.all([
      readJsonEntity<BudgetRecord[]>("presupuestos.json", async () => []),
      readJsonEntity<ClientRecord[]>("clientes.json", async () => []),
      readJsonEntity<WorkOrder[]>("ordenes-trabajo.json", async () => []),
      readJsonEntity<CalendarEntry[]>("calendario.json", async () => []),
    ]);
    const workOrders = await ensureWorkOrdersForBudgets(budgets, storedWorkOrders);
    const visibleOrders = user.perfil === "Admin"
      ? workOrders
      : workOrders.filter((workOrder) => workOrder.usuario_asignado === user.idusuario);
    const activeOrders = visibleOrders.filter((order) => order.estado !== "completada" && order.estado !== "cancelada");
    const overdueOrders = activeOrders.filter((order) => order.fecha_programada && order.fecha_programada < today);
    const endOfWindowDate = new Date(`${today}T00:00:00.000Z`);
    endOfWindowDate.setUTCDate(endOfWindowDate.getUTCDate() + 7);
    const endOfWindow = endOfWindowDate.toISOString().slice(0, 10);
    const upcomingOrders = activeOrders
      .filter((order) => order.fecha_programada >= today && order.fecha_programada <= endOfWindow)
      .sort((left, right) => left.fecha_programada.localeCompare(right.fecha_programada));
    const todayOrders = upcomingOrders.filter((order) => order.fecha_programada === today);
    const upcomingEntries = entries
      .filter((entry) => entry.fecha > today || (entry.fecha === today && entry.hora >= currentTime))
      .sort((left, right) => `${left.fecha} ${left.hora}`.localeCompare(`${right.fecha} ${right.hora}`));
    const clientsById = new Map(clients.map((client) => [client.idclientes, client]));
    const sentBudgets = budgets.filter((budget) => budget.estado === "enviado");
    const expiredBudgets = budgets.filter((budget) =>
      (budget.estado === "borrador" || budget.estado === "enviado") &&
      Boolean(budget.vigente_hasta) &&
      budget.vigente_hasta! < today,
    );
    const currentMonth = today.slice(0, 7);
    const acceptedThisMonth = budgets.filter((budget) =>
      budget.estado === "aceptado" && budget.fecha.startsWith(currentMonth),
    );

    const summary: DashboardSummary = {
      orders: {
        active: activeOrders.length,
        overdue: overdueOrders.length,
        upcoming: upcomingOrders.length,
        today: todayOrders.length,
        pending: activeOrders.filter((order) => order.estado === "pendiente" || order.estado === "programada").length,
        inProgress: activeOrders.filter((order) => order.estado === "en_curso").length,
        unassigned: activeOrders.filter((order) => !order.usuario_asignado).length,
      },
      admin: user.perfil === "Admin"
        ? {
          sentBudgets: sentBudgets.length,
          sentBudgetValue: sentBudgets.reduce((sum, budget) => sum + budget.total, 0),
          expiredBudgets: expiredBudgets.length,
          acceptedThisMonth: acceptedThisMonth.length,
          acceptedThisMonthValue: acceptedThisMonth.reduce((sum, budget) => sum + budget.total, 0),
          clients: clients.length,
        }
        : null,
      upcomingWorkOrders: upcomingOrders.slice(0, 5).map((order) => {
        const client = clientsById.get(order.idclientes);
        return {
          id: order.id,
          fecha_programada: order.fecha_programada,
          descripcion: order.descripcion,
          direccion: order.direccion,
          estado: order.estado,
          cliente: client ? `${client.nombre} ${client.apellido}` : null,
        };
      }),
      upcomingEntries: upcomingEntries.slice(0, user.perfil === "Admin" ? 2 : 4).map(({ id, fecha, hora, descripcion }) => ({
        id,
        fecha,
        hora,
        descripcion,
      })),
    };

    return Response.json({ summary }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Dashboard summary error:", error);
    return Response.json({ message: "No se pudo cargar el resumen." }, { status: 503 });
  }
}
