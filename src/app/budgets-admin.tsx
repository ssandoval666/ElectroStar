"use client";

import { Download, Eye, FileDown, LoaderCircle, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { BudgetRecord, ClientRecord } from "@/lib/budgets";

type Product = {
  idproducto: string;
  descripcion: string;
  Valor: number;
  fecha_modificacion: string;
  usuario_modificacion: string;
};

type BudgetLineInput = { idproducto: string; cantidad: number };
type ContactMode = "existing" | "new";
type BudgetForm = {
  idclientes: string;
  nombre: string;
  apellido: string;
  telefono: string;
  descripcion: string;
  fecha: string;
  productos: BudgetLineInput[];
};

const emptyForm = (): BudgetForm => ({
  idclientes: "",
  nombre: "",
  apellido: "",
  telefono: "",
  descripcion: "",
  fecha: new Date().toISOString().slice(0, 10),
  productos: [],
});

const currencyFormatter = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const dateFormatter = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

export default function BudgetsAdmin() {
  const [budgets, setBudgets] = useState<BudgetRecord[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [contactMode, setContactMode] = useState<ContactMode>("existing");
  const [form, setForm] = useState<BudgetForm>(emptyForm);
  const [editingBudget, setEditingBudget] = useState<BudgetRecord | null>(null);
  const [viewingBudget, setViewingBudget] = useState<BudgetRecord | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BudgetRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const budgetViewDialog = useRef<HTMLElement | null>(null);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const responses = await Promise.all([
        fetch("/api/budgets"),
        fetch("/api/clients"),
        fetch("/api/products"),
      ]);
      const results = await Promise.all(responses.map((response) => response.json()));
      const failedIndex = responses.findIndex((response) => !response.ok);
      if (failedIndex >= 0) throw new Error(results[failedIndex].message ?? "No se pudieron cargar los datos.");
      setBudgets(results[0].items);
      setClients(results[1].items);
      setProducts(results[2].items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los datos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([fetch("/api/budgets"), fetch("/api/clients"), fetch("/api/products")])
      .then(async (responses) => {
        const results = await Promise.all(responses.map((response) => response.json()));
        const failedIndex = responses.findIndex((response) => !response.ok);
        if (failedIndex >= 0) throw new Error(results[failedIndex].message ?? "No se pudieron cargar los datos.");
        return results;
      })
      .then((results) => {
        if (!active) return;
        setBudgets(results[0].items);
        setClients(results[1].items);
        setProducts(results[2].items);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los datos.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!viewingBudget) return;
    budgetViewDialog.current?.focus();

    function handleViewKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setViewingBudget(null);
    }

    window.addEventListener("keydown", handleViewKeyDown);
    return () => window.removeEventListener("keydown", handleViewKeyDown);
  }, [viewingBudget]);

  function startCreate() {
    setEditingBudget(null);
    setForm({ ...emptyForm(), productos: products.length ? [{ idproducto: "", cantidad: 1 }] : [] });
    setContactMode(clients.length ? "existing" : "new");
    setClientQuery("");
    setError("");
    setNotice("");
    setFormOpen(true);
  }

  function startEdit(budget: BudgetRecord) {
    const client = clients.find((item) => item.idclientes === budget.idclientes);
    setEditingBudget(budget);
    setForm({
      idclientes: budget.idclientes,
      nombre: client?.nombre ?? "",
      apellido: client?.apellido ?? "",
      telefono: client?.telefono ?? "",
      descripcion: budget.descripcion,
      fecha: budget.fecha,
      productos: budget.productos.map((item) => ({ idproducto: item.idproducto, cantidad: item.cantidad })),
    });
    setContactMode("existing");
    setClientQuery("");
    setError("");
    setNotice("");
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false);
    setEditingBudget(null);
    setForm(emptyForm());
  }

  function updateLine(index: number, patch: Partial<BudgetLineInput>) {
    setForm((current) => ({
      ...current,
      productos: current.productos.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line),
    }));
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    try {
      let idclientes = form.idclientes;
      if (contactMode === "new") {
        const clientResponse = await fetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre: form.nombre, apellido: form.apellido, telefono: form.telefono }),
        });
        const clientResult = await clientResponse.json();
        if (!clientResponse.ok) throw new Error(clientResult.message ?? "No se pudo guardar el cliente.");
        idclientes = (clientResult.client as ClientRecord).idclientes;
      }

      const response = await fetch(editingBudget ? `/api/budgets/${editingBudget.idpresupuesto}` : "/api/budgets", {
        method: editingBudget ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idclientes,
          descripcion: form.descripcion,
          fecha: form.fecha,
          productos: form.productos,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "No se pudo guardar el presupuesto.");

      await loadData();
      setFormOpen(false);
      setEditingBudget(null);
      setNotice(editingBudget ? "Presupuesto actualizado." : "Presupuesto creado.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el presupuesto.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/budgets/${pendingDelete.idpresupuesto}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "No se pudo eliminar el presupuesto.");
      setBudgets((current) => current.filter((item) => item.idpresupuesto !== pendingDelete.idpresupuesto));
      setPendingDelete(null);
      setNotice("Presupuesto eliminado.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el presupuesto.");
    } finally {
      setDeleting(false);
    }
  }

  async function exportBudget(budget: BudgetRecord) {
    setExportingId(budget.idpresupuesto);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/budgets/${budget.idpresupuesto}/export`);
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message ?? "No se pudo exportar el presupuesto.");
      }
      const file = await response.blob();
      const fileUrl = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = fileUrl;
      link.download = `presupuesto-${budget.idpresupuesto}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
      setNotice("PDF descargado.");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "No se pudo exportar el presupuesto.");
    } finally {
      setExportingId(null);
    }
  }

  const visibleBudgets = budgets.filter((budget) => {
    const client = clients.find((item) => item.idclientes === budget.idclientes);
    const searchable = `${budget.descripcion} ${client?.nombre ?? ""} ${client?.apellido ?? ""}`.toLocaleLowerCase();
    return searchable.includes(query.trim().toLocaleLowerCase());
  });

  const matchingClients = useMemo(() => {
    const normalizedQuery = clientQuery.trim().toLocaleLowerCase();
    return clients.filter((client) => `${client.nombre} ${client.apellido} ${client.telefono}`.toLocaleLowerCase().includes(normalizedQuery));
  }, [clients, clientQuery]);

  const selectedClient = clients.find((client) => client.idclientes === form.idclientes);
  const formTotal = form.productos.reduce((sum, line) => {
    const product = products.find((item) => item.idproducto === line.idproducto);
    return sum + (product ? product.Valor * (Number.isFinite(line.cantidad) ? line.cantidad : 0) : 0);
  }, 0);

  return (
    <section className="users-admin budgets-admin">
      <header className="users-admin-heading">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN DEL SISTEMA</span>
          <h1>Presupuestos</h1>
          <p>Prepará presupuestos vinculados a clientes y productos.</p>
        </div>
        <button className="users-create-button" onClick={startCreate} type="button"><Plus size={16} /> Nuevo presupuesto</button>
      </header>

      {notice && <p className="users-message users-message-success" role="status">{notice}</p>}
      {error && !formOpen && !pendingDelete && <p className="users-message users-message-error" role="alert">{error}</p>}

      <div className="users-table-toolbar">
        <label className="users-search"><Search size={16} /><input onChange={(event) => setQuery(event.target.value)} placeholder="Buscar presupuesto o cliente" value={query} /></label>
        <span>{budgets.length} {budgets.length === 1 ? "presupuesto" : "presupuestos"}</span>
      </div>

      <div aria-busy={loading} className="users-table-scroll">
        <table className="users-table budgets-table">
          <thead><tr><th>Presupuesto</th><th>Cliente</th><th>Fecha</th><th>Total</th><th><span className="visually-hidden">Acciones</span></th></tr></thead>
          <tbody>
            {loading ? <tr><td className="users-empty" colSpan={5}><span className="table-loading" role="status"><LoaderCircle aria-hidden="true" className="loading-spinner" size={17} /> Cargando presupuestos...</span></td></tr> : visibleBudgets.length ? visibleBudgets.map((budget) => {
              const client = clients.find((item) => item.idclientes === budget.idclientes);
              return (
                <tr key={budget.idpresupuesto}>
                  <td><strong className="budget-description">{budget.descripcion}</strong><small className="budget-lines-count">{budget.productos.length} {budget.productos.length === 1 ? "producto" : "productos"}</small></td>
                  <td>{client ? `${client.nombre} ${client.apellido}` : "Cliente no disponible"}<small className="budget-client-phone">{client?.telefono ?? ""}</small></td>
                  <td>{dateFormatter.format(new Date(`${budget.fecha}T00:00:00Z`))}</td>
                  <td className="product-value">{currencyFormatter.format(budget.total)}</td>
                  <td><div className="users-row-actions">
                    <button aria-label={`Ver ${budget.descripcion}`} className="users-icon-button" onClick={() => setViewingBudget(budget)} title="Ver presupuesto" type="button"><Eye size={15} /></button>
                    <button aria-label={`Exportar ${budget.descripcion} a PDF`} className="users-icon-button budget-export-icon" disabled={exportingId === budget.idpresupuesto} onClick={() => void exportBudget(budget)} title="Exportar a PDF" type="button">{exportingId === budget.idpresupuesto ? <LoaderCircle aria-hidden="true" className="loading-spinner" size={15} /> : <FileDown size={15} />}</button>
                    <button aria-label={`Editar ${budget.descripcion}`} className="users-icon-button" onClick={() => startEdit(budget)} title="Editar presupuesto" type="button"><Pencil size={15} /></button>
                    <button aria-label={`Eliminar ${budget.descripcion}`} className="users-icon-button users-delete-button" onClick={() => { setError(""); setPendingDelete(budget); }} title="Eliminar presupuesto" type="button"><Trash2 size={15} /></button>
                  </div></td>
                </tr>
              );
            }) : <tr><td className="users-empty" colSpan={5}>{query ? "No hay presupuestos que coincidan con la búsqueda." : "Todavía no hay presupuestos."}</td></tr>}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <div className="users-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }}>
          <section aria-labelledby="budget-editor-title" aria-modal="true" className="users-modal budget-modal" role="dialog">
            <header className="users-modal-heading">
              <div><span className="eyebrow">{editingBudget ? "MODIFICACIÓN" : "ALTA"}</span><h2 id="budget-editor-title">{editingBudget ? "Editar presupuesto" : "Nuevo presupuesto"}</h2><p>Datos del cliente, vigencia y detalle del presupuesto.</p></div>
              <button aria-label="Cerrar modal" className="users-icon-button" disabled={saving} onClick={closeForm} type="button"><X size={18} /></button>
            </header>
            <form className="budget-editor" onSubmit={submitForm}>
              <section className="budget-form-section">
                <div className="budget-section-heading"><h3>Cliente</h3><div className="budget-mode-toggle" role="group" aria-label="Modo de cliente">
                  <button aria-pressed={contactMode === "existing"} className={contactMode === "existing" ? "budget-mode-active" : ""} onClick={() => { setContactMode("existing"); setForm((current) => ({ ...current, idclientes: "" })); }} type="button">Buscar existente</button>
                  <button aria-pressed={contactMode === "new"} className={contactMode === "new" ? "budget-mode-active" : ""} onClick={() => { setContactMode("new"); setForm((current) => ({ ...current, idclientes: "" })); }} type="button">Nuevo cliente</button>
                </div></div>
                {contactMode === "existing" ? <div className="budget-client-picker">
                  <label className="budget-field">Buscar cliente<input onChange={(event) => setClientQuery(event.target.value)} placeholder="Nombre, apellido o teléfono" value={clientQuery} /></label>
                  <label className="budget-field">Cliente<select onChange={(event) => setForm((current) => ({ ...current, idclientes: event.target.value }))} required value={form.idclientes}>
                    <option value="">Seleccionar cliente</option>
                    {matchingClients.map((client) => <option key={client.idclientes} value={client.idclientes}>{client.nombre} {client.apellido} · {client.telefono}</option>)}
                  </select></label>
                  {selectedClient && <div className="budget-selected-client"><strong>{selectedClient.nombre} {selectedClient.apellido}</strong><span>{selectedClient.telefono}</span></div>}
                  {!clients.length && <p className="budget-inline-hint">No hay clientes guardados. Elegí “Nuevo cliente”.</p>}
                </div> : <div className="budget-client-fields">
                  <label className="budget-field">Nombre<input autoComplete="given-name" maxLength={80} onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))} required value={form.nombre} /></label>
                  <label className="budget-field">Apellido<input autoComplete="family-name" maxLength={80} onChange={(event) => setForm((current) => ({ ...current, apellido: event.target.value }))} required value={form.apellido} /></label>
                  <label className="budget-field budget-field-wide">Teléfono de contacto<input autoComplete="tel" maxLength={40} onChange={(event) => setForm((current) => ({ ...current, telefono: event.target.value }))} required type="tel" value={form.telefono} /></label>
                </div>}
              </section>

              <section className="budget-form-section">
                <div className="budget-section-heading"><h3>Presupuesto</h3></div>
                <div className="budget-meta-fields">
                  <label className="budget-field">Descripción<input maxLength={500} onChange={(event) => setForm((current) => ({ ...current, descripcion: event.target.value }))} required value={form.descripcion} /></label>
                  <label className="budget-field">Fecha<input onChange={(event) => setForm((current) => ({ ...current, fecha: event.target.value }))} required type="date" value={form.fecha} /></label>
                </div>
              </section>

              <section className="budget-form-section">
                <div className="budget-section-heading"><h3>Productos</h3><button className="budget-add-line" disabled={!products.length} onClick={() => setForm((current) => ({ ...current, productos: [...current.productos, { idproducto: "", cantidad: 1 }] }))} type="button"><Plus size={14} /> Agregar producto</button></div>
                {form.productos.length ? <div className="budget-products-grid-scroll">
                  <table className="budget-products-grid">
                    <thead><tr><th>Producto / servicio</th><th>Cantidad</th><th>Valor unitario</th><th>Subtotal</th><th><span className="visually-hidden">Acciones</span></th></tr></thead>
                    <tbody>{form.productos.map((line, index) => {
                      const product = products.find((item) => item.idproducto === line.idproducto);
                      const lineTotal = (product?.Valor ?? 0) * (Number.isFinite(line.cantidad) ? line.cantidad : 0);
                      return <tr key={`${index}-${line.idproducto}`}>
                        <td><select aria-label="Producto o servicio" onChange={(event) => updateLine(index, { idproducto: event.target.value })} required value={line.idproducto}>
                          <option value="">Seleccionar producto</option>
                          {products.map((item) => <option key={item.idproducto} value={item.idproducto}>{item.descripcion}</option>)}
                        </select></td>
                        <td><input aria-label="Cantidad" min="0.01" onChange={(event) => updateLine(index, { cantidad: Number(event.target.value) })} required step="0.01" type="number" value={line.cantidad} /></td>
                        <td className="budget-grid-money">{product ? currencyFormatter.format(product.Valor) : "--"}</td>
                        <td className="budget-grid-money budget-grid-subtotal">{currencyFormatter.format(lineTotal)}</td>
                        <td><button aria-label="Quitar producto" className="users-icon-button users-delete-button" disabled={form.productos.length === 1} onClick={() => setForm((current) => ({ ...current, productos: current.productos.filter((_, lineIndex) => lineIndex !== index) }))} title="Quitar producto" type="button"><Trash2 size={15} /></button></td>
                      </tr>;
                    })}</tbody>
                  </table>
                  {!products.length && <p className="budget-inline-hint">No hay productos disponibles para agregar.</p>}
                </div> : <p className="budget-inline-hint">Agregá al menos un producto al presupuesto.</p>}
                <div className="budget-grand-total"><span>Total del presupuesto</span><strong>{currencyFormatter.format(formTotal)}</strong></div>
              </section>

              {error && <p className="users-message users-message-error" role="alert">{error}</p>}
              <div className="user-editor-actions">
                <button className="users-cancel-button" disabled={saving} onClick={closeForm} type="button">Cancelar</button>
                <button className="users-save-button" disabled={saving} type="submit">{saving && <LoaderCircle aria-hidden="true" className="loading-spinner" size={14} />}{saving ? "Guardando..." : "Guardar presupuesto"}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {pendingDelete && <div className="users-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setPendingDelete(null); }}>
        <section aria-labelledby="budget-delete-title" aria-modal="true" className="users-modal" role="alertdialog">
          <header className="users-modal-heading"><div><h2 id="budget-delete-title">Eliminar presupuesto</h2><p>Esta acción no se puede deshacer.</p></div><button aria-label="Cerrar modal" className="users-icon-button" disabled={deleting} onClick={() => setPendingDelete(null)} type="button"><X size={17} /></button></header>
          <div className="delete-confirmation"><p>¿Querés eliminar <strong>{pendingDelete.descripcion}</strong>?</p>{error && <p className="users-message users-message-error" role="alert">{error}</p>}<div className="user-editor-actions"><button className="users-cancel-button" disabled={deleting} onClick={() => setPendingDelete(null)} type="button">Cancelar</button><button className="users-confirm-delete" disabled={deleting} onClick={() => void confirmDelete()} type="button">{deleting && <LoaderCircle aria-hidden="true" className="loading-spinner" size={14} />}{deleting ? "Eliminando..." : "Eliminar presupuesto"}</button></div></div>
        </section>
      </div>}

      {viewingBudget && (() => {
        const client = clients.find((item) => item.idclientes === viewingBudget.idclientes);
        return <div className="users-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewingBudget(null); }}>
          <section aria-labelledby="budget-view-title" aria-modal="true" className="users-modal budget-view-modal" ref={budgetViewDialog} role="dialog" tabIndex={-1}>
            <header className="users-modal-heading">
              <div><span className="eyebrow">VISTA PREVIA PARA CLIENTE</span><h2 id="budget-view-title">Presupuesto</h2><p>{viewingBudget.descripcion}</p></div>
              <button aria-label="Cerrar vista" className="users-icon-button" onClick={() => setViewingBudget(null)} type="button"><X size={18} /></button>
            </header>
            <div className="budget-view-content">
              <div className="budget-view-brand"><strong>ELECTROSTAR</strong><span>PROPUESTA COMERCIAL</span></div>
              <div className="budget-view-info">
                <div><span>CLIENTE</span><strong>{client ? `${client.nombre} ${client.apellido}` : "Cliente no disponible"}</strong><small>{client?.telefono ?? ""}</small></div>
                <div><span>FECHA DEL PRESUPUESTO</span><strong>{dateFormatter.format(new Date(`${viewingBudget.fecha}T00:00:00Z`))}</strong><small>N° {viewingBudget.idpresupuesto.slice(0, 8).toUpperCase()}</small></div>
              </div>
              <div className="budget-view-table-scroll"><table className="budget-view-table">
                <thead><tr><th>Producto / servicio</th><th>Cantidad</th><th>Valor unitario</th><th>Subtotal</th></tr></thead>
                <tbody>{viewingBudget.productos.map((item, index) => <tr key={`${item.idproducto}-${index}`}>
                  <td>{item.descripcion_producto}</td><td>{item.cantidad}</td><td>{currencyFormatter.format(item.valor_unitario)}</td><td>{currencyFormatter.format(item.valor_total)}</td>
                </tr>)}</tbody>
                <tfoot><tr><td colSpan={3}>TOTAL DEL PRESUPUESTO</td><td>{currencyFormatter.format(viewingBudget.total)}</td></tr></tfoot>
              </table></div>
              <footer className="budget-view-footer"><span>Gracias por confiar en ElectroStar.</span><button className="users-save-button" disabled={exportingId === viewingBudget.idpresupuesto} onClick={() => void exportBudget(viewingBudget)} type="button">{exportingId === viewingBudget.idpresupuesto ? <LoaderCircle aria-hidden="true" className="loading-spinner" size={15} /> : <Download size={15} />}{exportingId === viewingBudget.idpresupuesto ? "Preparando PDF..." : "Exportar a PDF"}</button></footer>
            </div>
          </section>
        </div>;
      })()}
    </section>
  );
}