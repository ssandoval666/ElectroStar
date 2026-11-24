"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { LoaderCircle, Pencil, Plus, Search, X } from "lucide-react";
import type { BudgetRecord, ClientRecord } from "@/lib/budgets";
import type { WorkOrderView } from "@/lib/work-orders";

type ClientForm = { nombre: string; apellido: string; telefono: string; direccion: string };
const emptyClientForm: ClientForm = { nombre: "", apellido: "", telefono: "", direccion: "" };

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
  const [savingClient, setSavingClient] = useState(false);
  const [clientFormOpen, setClientFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientRecord | null>(null);
  const [clientForm, setClientForm] = useState<ClientForm>(emptyClientForm);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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

  function openCreateClient() {
    setEditingClient(null);
    setClientForm(emptyClientForm);
    setError("");
    setNotice("");
    setClientFormOpen(true);
  }

  function openEditClient(client: ClientRecord) {
    setEditingClient(client);
    setClientForm({
      nombre: client.nombre,
      apellido: client.apellido,
      telefono: client.telefono,
      direccion: client.direccion ?? "",
    });
    setError("");
    setNotice("");
    setClientFormOpen(true);
  }

  function closeClientForm() {
    if (savingClient) return;
    setClientFormOpen(false);
    setEditingClient(null);
    setClientForm(emptyClientForm);
    setError("");
  }

  async function saveClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingClient(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(editingClient ? `/api/clients/${editingClient.idclientes}` : "/api/clients", {
        method: editingClient ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clientForm),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "No se pudo guardar el cliente.");

      const savedClient = result.client as ClientRecord;
      setClients((current) => editingClient
        ? current.map((client) => client.idclientes === savedClient.idclientes ? savedClient : client)
        : [...current, savedClient]);
      setSelectedId(savedClient.idclientes);
      setClientFormOpen(false);
      setEditingClient(null);
      setClientForm(emptyClientForm);
      setNotice(editingClient ? "Cliente actualizado." : "Cliente creado.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el cliente.");
    } finally {
      setSavingClient(false);
    }
  }

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
      <header className="users-admin-heading">
        <div><span className="eyebrow">RELACIÓN CON CLIENTES</span><h1>Clientes</h1><p>Consultá el historial de presupuestos y trabajos de cada cliente.</p></div>
        <button className="users-create-button" onClick={openCreateClient} type="button"><Plus size={16} /> Nuevo cliente</button>
      </header>
      {notice && <p className="users-message users-message-success" role="status">{notice}</p>}
      {error && !clientFormOpen && <p className="users-message users-message-error" role="alert">{error}</p>}
      {clientFormOpen && <div className="users-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeClientForm(); }}>
        <section aria-labelledby="client-editor-title" aria-modal="true" className="users-modal client-editor-modal" role="dialog">
          <header className={`users-modal-heading modal-heading-${error ? "error" : "info"}`}>
            <div><span className="eyebrow">{editingClient ? "MODIFICACIÓN" : "ALTA"}</span><h2 id="client-editor-title">{editingClient ? "Editar cliente" : "Nuevo cliente"}</h2><p>Completá los datos de contacto.</p></div>
            <button aria-label="Cerrar formulario" className="users-icon-button" disabled={savingClient} onClick={closeClientForm} type="button"><X size={18} /></button>
          </header>
          <form className="client-editor" onSubmit={saveClient}>
            <div className="client-editor-fields">
              <label className="budget-field">Nombre<input autoComplete="given-name" autoFocus maxLength={80} onChange={(event) => setClientForm((current) => ({ ...current, nombre: event.target.value }))} required value={clientForm.nombre} /></label>
              <label className="budget-field">Apellido<input autoComplete="family-name" maxLength={80} onChange={(event) => setClientForm((current) => ({ ...current, apellido: event.target.value }))} required value={clientForm.apellido} /></label>
              <label className="budget-field">Teléfono de contacto<input autoComplete="tel" maxLength={40} onChange={(event) => setClientForm((current) => ({ ...current, telefono: event.target.value }))} required type="tel" value={clientForm.telefono} /></label>
              <label className="budget-field">Dirección (opcional)<input autoComplete="street-address" maxLength={240} onChange={(event) => setClientForm((current) => ({ ...current, direccion: event.target.value }))} value={clientForm.direccion} /></label>
            </div>
            {error && <p className="users-message users-message-error" role="alert">{error}</p>}
            <div className="user-editor-actions">
              <button className="users-cancel-button" disabled={savingClient} onClick={closeClientForm} type="button">Cancelar</button>
              <button className="users-save-button" disabled={savingClient} type="submit">{savingClient && <LoaderCircle aria-hidden="true" className="loading-spinner" size={14} />}{savingClient ? "Guardando..." : editingClient ? "Guardar cambios" : "Crear cliente"}</button>
            </div>
          </form>
        </section>
      </div>}
      {loading ? <p className="history-loading" role="status"><LoaderCircle className="loading-spinner" size={17} /> Cargando historial...</p> : <div className="client-history-layout">
        <aside className="client-history-list">
          <label className="users-search"><Search size={16} /><input onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente" value={query} /></label>
          <div className="client-history-options">{visibleClients.map((client) => <button className={`client-history-option ${client.idclientes === selectedId ? "client-history-option-active" : ""}`} key={client.idclientes} onClick={() => setSelectedId(client.idclientes)} type="button"><strong>{client.nombre} {client.apellido}</strong><span>{client.telefono}</span></button>)}
            {!visibleClients.length && <p className="client-history-empty">No hay clientes que coincidan.</p>}
          </div>
        </aside>
        {selectedClient ? <div className="client-history-detail">
          <section className="client-history-profile">
            <div><span className="eyebrow">FICHA DEL CLIENTE</span><h2>{selectedClient.nombre} {selectedClient.apellido}</h2><p>{selectedClient.telefono}</p>{selectedClient.direccion && <p>{selectedClient.direccion}</p>}</div>
            <button aria-label={`Editar ${selectedClient.nombre} ${selectedClient.apellido}`} className="users-cancel-button client-edit-button" onClick={() => openEditClient(selectedClient)} type="button"><Pencil size={14} /> Editar</button>
          </section>
          <div className="client-history-stats"><article><strong>{clientBudgets.length}</strong><span>Presupuestos</span></article><article><strong>{clientOrders.length}</strong><span>Órdenes de trabajo</span></article></div>
          <section className="client-history-timeline"><div className="panel-heading"><div><span className="eyebrow">ACTIVIDAD</span><h2>Historial</h2></div><span>{history.length} registros</span></div>
            {history.length ? history.map((entry) => <article className="client-history-entry" key={entry.id}><span className={`client-history-kind ${entry.kind === "Presupuesto" ? "client-history-kind-budget" : "client-history-kind-order"}`}>{entry.kind}</span><div><strong>{entry.description}</strong><span>{entry.status} · {entry.detail}</span></div><time dateTime={entry.date}>{dateFormatter.format(new Date(`${entry.date}T00:00:00Z`))}</time></article>) : <p className="client-history-empty">Este cliente todavía no tiene presupuestos ni órdenes de trabajo.</p>}
          </section>
        </div> : <div className="client-history-detail"><p className="client-history-empty">{clients.length ? "No hay clientes que coincidan con la búsqueda." : "Todavía no hay clientes registrados. Creá el primero con “Nuevo cliente”."}</p></div>}
      </div>}
    </section>
  );
}
