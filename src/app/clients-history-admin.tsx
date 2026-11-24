"use client";

import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Search } from "lucide-react";
import type { BudgetRecord, ClientRecord } from "@/lib/budgets";
import type { WorkOrderView } from "@/lib/work-orders";

type HistoryItem = {
  id: string;
  date: string;
  kind: "Presupuesto" | "Orden de trabajo";
  description: string;
  status: string;
  detail: string;
};
const budgetLabels: Record<string, string> = {
  borrador: "Borrador",
  enviado: "Enviado",
  aceptado: "Aceptado",
  rechazado: "Rechazado",
};
const workOrderLabels: Record<string, string> = {
  pendiente: "Pendiente",
  programada: "Programada",
  en_curso: "En curso",
  completada: "Completada",
  cancelada: "Cancelada",
};
const dateFormatter = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const currencyFormatter = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

export default function ClientsHistoryAdmin() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [budgets, setBudgets] = useState<BudgetRecord[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrderView[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([fetch("/api/clients"), fetch("/api/budgets"), fetch("/api/work-orders")])
      .then(async (responses) => {
        const results = await Promise.all(responses.map((response) => response.json()));
        const failedIndex = responses.findIndex((response) => !response.ok);
        if (failedIndex >= 0) throw new Error(results[failedIndex].message ?? "No se pudo cargar el historial.");
        return results;
      })
      .then((results) => {
        if (!active) return;
        const [clientResult, budgetResult, orderResult] = results;
        setClients(clientResult.items);
        setBudgets(budgetResult.items);
        setWorkOrders(orderResult.items);
        setSelectedId((current) => current || clientResult.items[0]?.idclientes || "");
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el historial.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visibleClients = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return clients.filter((client) => `${client.nombre} ${client.apellido} ${client.telefono} ${client.direccion ?? ""}`.toLocaleLowerCase().includes(normalized));
  }, [clients, query]);
  const selectedClient = clients.find((client) => client.idclientes === selectedId);
  const history = useMemo<HistoryItem[]>(() => {
    if (!selectedId) return [];
    const budgetHistory = budgets.filter((budget) => budget.idclientes === selectedId).map((budget) => ({
      id: `budget-${budget.idpresupuesto}`,
      date: budget.fecha,
      kind: "Presupuesto" as const,
      description: budget.descripcion,
      status: budget.vigente_hasta && budget.vigente_hasta < new Date().toISOString().slice(0, 10) && (budget.estado === "borrador" || budget.estado === "enviado")
        ? "Vencido"
        : budgetLabels[budget.estado ?? "borrador"],
      detail: currencyFormatter.format(budget.total),
    }));
    const orderHistory = workOrders.filter((workOrder) => workOrder.idclientes === selectedId).map((workOrder) => ({
      id: `order-${workOrder.id}`,
      date: workOrder.fecha_programada || workOrder.fecha_creacion.slice(0, 10),
      kind: "Orden de trabajo" as const,
      description: workOrder.descripcion,
      status: workOrderLabels[workOrder.estado] ?? "Pendiente",
      detail: workOrder.direccion || "Sin dirección registrada",
    }));
    return [...budgetHistory, ...orderHistory].sort((left, right) => right.date.localeCompare(left.date));
  }, [budgets, selectedId, workOrders]);
  const clientBudgets = budgets.filter((budget) => budget.idclientes === selectedId);
  const clientOrders = workOrders.filter((workOrder) => workOrder.idclientes === selectedId);

  return (
    <section className="users-admin clients-history-admin">
      <header className="users-admin-heading"><div><span className="eyebrow">RELACIÓN CON CLIENTES</span><h1>Clientes</h1><p>Consultá el historial de presupuestos y trabajos de cada cliente.</p></div></header>
      {error && <p className="users-message users-message-error" role="alert">{error}</p>}
      {loading ? <p className="history-loading" role="status"><LoaderCircle className="loading-spinner" size={17} /> Cargando historial...</p> : clients.length ? <div className="client-history-layout">
        <aside className="client-history-list">
          <label className="users-search"><Search size={16} /><input onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente" value={query} /></label>
          <div className="client-history-options">{visibleClients.map((client) => <button className={`client-history-option ${client.idclientes === selectedId ? "client-history-option-active" : ""}`} key={client.idclientes} onClick={() => setSelectedId(client.idclientes)} type="button"><strong>{client.nombre} {client.apellido}</strong><span>{client.telefono}</span></button>)}
            {!visibleClients.length && <p className="client-history-empty">No hay clientes que coincidan.</p>}
          </div>
        </aside>
        {selectedClient ? <div className="client-history-detail">
          <section className="client-history-profile"><span className="eyebrow">FICHA DEL CLIENTE</span><h2>{selectedClient.nombre} {selectedClient.apellido}</h2><p>{selectedClient.telefono}</p>{selectedClient.direccion && <p>{selectedClient.direccion}</p>}</section>
          <div className="client-history-stats"><article><strong>{clientBudgets.length}</strong><span>Presupuestos</span></article><article><strong>{clientOrders.length}</strong><span>Órdenes de trabajo</span></article></div>
          <section className="client-history-timeline"><div className="panel-heading"><div><span className="eyebrow">ACTIVIDAD</span><h2>Historial</h2></div><span>{history.length} registros</span></div>
            {history.length ? history.map((entry) => <article className="client-history-entry" key={entry.id}><span className={`client-history-kind ${entry.kind === "Presupuesto" ? "client-history-kind-budget" : "client-history-kind-order"}`}>{entry.kind}</span><div><strong>{entry.description}</strong><span>{entry.status} · {entry.detail}</span></div><time dateTime={entry.date}>{dateFormatter.format(new Date(`${entry.date}T00:00:00Z`))}</time></article>) : <p className="client-history-empty">Este cliente todavía no tiene presupuestos ni órdenes de trabajo.</p>}
          </section>
        </div> : <div className="client-history-detail"><p className="client-history-empty">No hay clientes que coincidan con la búsqueda.</p></div>}
      </div> : <div className="users-table-scroll"><p className="users-empty">Todavía no hay clientes registrados. Se agregan al crear un presupuesto.</p></div>}
    </section>
  );
}
