import type { CalendarEntry } from "@/lib/calendar";
import type { WorkOrderStatus } from "@/lib/work-orders";

export type DashboardOrder = {
  id: string;
  fecha_programada: string;
  descripcion: string;
  direccion: string;
  estado: WorkOrderStatus;
  cliente: string | null;
};

export type DashboardEntry = Pick<CalendarEntry, "id" | "fecha" | "hora" | "descripcion">;

export type DashboardSummary = {
  orders: {
    active: number;
    overdue: number;
    upcoming: number;
    today: number;
    pending: number;
    inProgress: number;
    unassigned: number;
  };
  admin: {
    sentBudgets: number;
    sentBudgetValue: number;
    expiredBudgets: number;
    acceptedThisMonth: number;
    acceptedThisMonthValue: number;
    clients: number;
  } | null;
  upcomingWorkOrders: DashboardOrder[];
  upcomingEntries: DashboardEntry[];
};
