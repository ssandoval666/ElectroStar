"use client";

import { useEffect, useState, type FormEvent } from "react";
import { LoaderCircle, Pencil, Search, X } from "lucide-react";
import type { WorkOrderStatus, WorkOrderView } from "@/lib/work-orders";

type ManagedUser = { idusuario: string; usuario: string; perfil: "Admin" | "Operario" };
type WorkOrderForm = {
  tareas: string;
  direccion: string;
  fecha_programada: string;
  usuario_asignado: string;
  estado: WorkOrderStatus;
};

const statusLabels: Record<WorkOrderStatus, string> = {
  pendiente: "Pendiente",
  programada: "Programada",
  en_curso: "En curso",
  completada: "Completada",
  cancelada: "Cancelada",
};
const statusChoices: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  pendiente: ["pendiente", "programada", "en_curso"],
  programada: ["programada", "en_curso"],
  en_curso: ["en_curso", "completada"],
  completada: ["completada"],
  cancelada: ["cancelada"],
};

export default function WorkOrdersAdmin({ isAdmin }: { isAdmin: boolean }) {
  const [workOrders, setWorkOrders] = useState<WorkOrderView[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<WorkOrderView | null>(null);
  const [form, setForm] = useState<WorkOrderForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const responses = await Promise.all([
        fetch("/api/work-orders"),
        ...(isAdmin ? [fetch("/api/users")] : []),
      ]);
      const results = await Promise.all(responses.map((response) => response.json()));
      const failedIndex = responses.findIndex((response) => !response.ok);
      if (failedIndex >= 0) throw new Error(results[failedIndex].message ?? "No se pudieron cargar las órdenes.");
      setWorkOrders(results[0].items);
      if (isAdmin) setUsers(results[1].items.filter((user: ManagedUser) => user.perfil === "Operario"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar las órdenes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const responses = await Promise.all([
          fetch("/api/work-orders"),
          ...(isAdmin ? [fetch("/api/users")] : []),
        ]);
        const results = await Promise.all(responses.map((response) => response.json()));
        const failedIndex = responses.findIndex((response) => !response.ok);
        if (failedIndex >= 0) throw new Error(results[failedIndex].message ?? "No se pudieron cargar las órdenes.");
        if (!active) return;
        setWorkOrders(results[0].items);
        if (isAdmin) setUsers(results[1].items.filter((user: ManagedUser) => user.perfil === "Operario"));
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar las órdenes.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialize();
    return () => { active = false; };
  }, [isAdmin]);

  function editWorkOrder(workOrder: WorkOrderView) {
    setSelected(workOrder);
    setForm({
      tareas: workOrder.tareas,
      direccion: workOrder.direccion,
      fecha_programada: workOrder.fecha_programada,
      usuario_asignado: workOrder.usuario_asignado,
      estado: workOrder.estado,
    });
    setError("");
  }

  async function updateStatus(workOrder: WorkOrderView, estado: WorkOrderStatus) {
    setUpdatingId(workOrder.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/work-orders/${workOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "No se pudo actualizar la orden.");
      setWorkOrders((items) => items.map((item) => item.id === workOrder.id ? { ...item, estado } : item));
      setNotice("Estado de la orden actualizado.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "No se pudo actualizar la orden.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function saveWorkOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !form) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/work-orders/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "No se pudo guardar la orden.");
      await loadData();
      setSelected(null);
      setForm(null);
      setNotice("Orden de trabajo actualizada.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar la orden.");
    } finally {
      setSaving(false);
    }
  }

  const visibleOrders = workOrders.filter((workOrder) => {
    const searchable = `${workOrder.descripcion} ${workOrder.cliente?.nombre ?? ""} ${workOrder.cliente?.apellido ?? ""} ${workOrder.direccion}`.toLocaleLowerCase();
    return searchable.includes(query.trim().toLocaleLowerCase());
  });

  return (
    <section className="users-admin work-orders-admin">
      <header className="users-admin-heading">
        <div><span className="eyebrow">GESTIÓN DE SERVICIOS</span><h1>Órdenes de trabajo</h1><p>Coordiná tareas, materiales, fechas y técnicos asignados.</p></div>
      </header>
      {notice && <p className="users-message users-message-success" role="status">{notice}</p>}
      {error && !selected && <p className="users-message users-message-error" role="alert">{error}</p>}
      <div className="users-table-toolbar">
        <label className="users-search"><Search size={16} /><input onChange={(event) => setQuery(event.target.value)} placeholder="Buscar orden, cliente o dirección" value={query} /></label>
        <span>{workOrders.length} {workOrders.length === 1 ? "orden" : "órdenes"}</span>
      </div>
      <div aria-busy={loading} className="users-table-scroll">
        <table className="users-table work-orders-table">
          <thead><tr><th>Trabajo</th><th>Cliente</th><th>Programación</th><th>Técnico</th><th>Estado</th><th><span className="visually-hidden">Acciones</span></th></tr></thead>
          <tbody>
            {loading ? <tr><td className="users-empty" colSpan={6}><span className="table-loading" role="status"><LoaderCircle className="loading-spinner" size={17} /> Cargando órdenes...</span></td></tr>
              : visibleOrders.length ? visibleOrders.map((workOrder) => {
                const assignee = users.find((user) => user.idusuario === workOrder.usuario_asignado);
                return <tr key={workOrder.id}>
                  <td><strong className="budget-description">{workOrder.descripcion}</strong><small className="budget-lines-count">{workOrder.materiales.length} {workOrder.materiales.length === 1 ? "material" : "materiales"}</small></td>
                  <td>{workOrder.cliente ? `${workOrder.cliente.nombre} ${workOrder.cliente.apellido}` : "Cliente no disponible"}<small className="budget-client-phone">{workOrder.cliente?.telefono ?? ""}</small></td>
                  <td>{workOrder.fecha_programada || "Sin programar"}<small className="budget-client-phone">{workOrder.direccion || "Dirección pendiente"}</small></td>
                  <td>{assignee?.usuario ?? (workOrder.usuario_asignado ? "Técnico asignado" : "Sin asignar")}</td>
                  <td><span className={`budget-status work-order-status-${workOrder.estado}`}>{statusLabels[workOrder.estado]}</span></td>
                  <td><div className="users-row-actions">
                    {isAdmin
                      ? <button aria-label={`Editar orden ${workOrder.descripcion}`} className="users-icon-button" onClick={() => editWorkOrder(workOrder)} title="Editar orden" type="button"><Pencil size={15} /></button>
                      : <select aria-label={`Actualizar estado de ${workOrder.descripcion}`} className="work-order-status-select" disabled={updatingId === workOrder.id} onChange={(event) => void updateStatus(workOrder, event.target.value as WorkOrderStatus)} value={workOrder.estado}>
                        {statusChoices[workOrder.estado].map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                      </select>}
                  </div></td>
                </tr>;
              }) : <tr><td className="users-empty" colSpan={6}>{query ? "No hay órdenes que coincidan con la búsqueda." : isAdmin ? "Todavía no hay órdenes. Se crean al aceptar un presupuesto." : "No tenés órdenes asignadas."}</td></tr>}
          </tbody>
        </table>
      </div>
      {selected && form && <div className="users-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) { setSelected(null); setForm(null); } }}>
        <section aria-labelledby="work-order-title" aria-modal="true" className="users-modal work-order-modal" role="dialog">
          <header className="users-modal-heading"><div><span className="eyebrow">ORDEN DE TRABAJO</span><h2 id="work-order-title">{selected.descripcion}</h2><p>{selected.cliente ? `${selected.cliente.nombre} ${selected.cliente.apellido} · ${selected.cliente.telefono}` : "Cliente no disponible"}</p></div><button aria-label="Cerrar" className="users-icon-button" disabled={saving} onClick={() => { setSelected(null); setForm(null); }} type="button"><X size={18} /></button></header>
          <form className="work-order-editor" onSubmit={saveWorkOrder}>
            <div className="work-order-editor-fields">
              <label className="budget-field">Fecha programada<input onChange={(event) => setForm({ ...form, fecha_programada: event.target.value })} type="date" value={form.fecha_programada} /></label>
              <label className="budget-field">Estado<select onChange={(event) => setForm({ ...form, estado: event.target.value as WorkOrderStatus })} value={form.estado}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="budget-field work-order-field-wide">Dirección del trabajo<input maxLength={240} onChange={(event) => setForm({ ...form, direccion: event.target.value })} value={form.direccion} /></label>
              <label className="budget-field work-order-field-wide">Tareas<input maxLength={2000} onChange={(event) => setForm({ ...form, tareas: event.target.value })} required value={form.tareas} /></label>
              <label className="budget-field work-order-field-wide">Técnico asignado<select onChange={(event) => setForm({ ...form, usuario_asignado: event.target.value })} value={form.usuario_asignado}><option value="">Sin asignar</option>{users.map((user) => <option key={user.idusuario} value={user.idusuario}>{user.usuario}</option>)}</select></label>
            </div>
            <section className="work-order-materials"><h3>Materiales del presupuesto</h3>{selected.materiales.length ? selected.materiales.map((material, index) => <div key={`${material.idproducto}-${index}`}><span>{material.descripcion_producto}</span><strong>{material.cantidad}</strong></div>) : <p>No hay materiales asociados.</p>}</section>
            {error && <p className="users-message users-message-error" role="alert">{error}</p>}
            <div className="user-editor-actions"><button className="users-cancel-button" disabled={saving} onClick={() => { setSelected(null); setForm(null); }} type="button">Cancelar</button><button className="users-save-button" disabled={saving} type="submit">{saving && <LoaderCircle className="loading-spinner" size={14} />}{saving ? "Guardando..." : "Guardar orden"}</button></div>
          </form>
        </section>
      </div>}
    </section>
  );
}
