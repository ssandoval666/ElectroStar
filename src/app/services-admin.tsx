"use client";

import { Check, CheckCheck, LoaderCircle, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { ServiceProposal, ServiceRecord, ServiceSourceStatus } from "@/lib/services";

type ServiceForm = { descripcion: string; categoria: string; unidad: string; Valor: string };
type ProposalForm = { descripcion: string; categoria: string; unidad: string; idservicio: string };
type BulkSkippedProposal = { id: string; descripcion: string; reason: string };

const emptyForm: ServiceForm = { descripcion: "", categoria: "", unidad: "", Valor: "" };
const currencyFormatter = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });
const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" });

export default function ServicesAdmin() {
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [proposals, setProposals] = useState<ServiceProposal[]>([]);
  const [source, setSource] = useState<ServiceSourceStatus | null>(null);
  const [proposalForms, setProposalForms] = useState<Record<string, ProposalForm>>({});
  const [bulkSkipped, setBulkSkipped] = useState<BulkSkippedProposal[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<ServiceForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ServiceRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [proposalsModalOpen, setProposalsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checkingSource, setCheckingSource] = useState(false);
  const [forcingComparison, setForcingComparison] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadServices() {
    const response = await fetch("/api/services");
    const result = await response.json();
    if (!response.ok) throw new Error(result.message ?? "No se pudieron cargar los servicios.");
    setServices(result.items);
    setProposals(result.proposals);
    setSource(result.source);
    const previousProposals = new Map(proposals.map((proposal) => [proposal.id, proposal]));
    setProposalForms((current) => Object.fromEntries(
      result.proposals
        .filter((proposal: ServiceProposal) => proposal.estado === "pendiente")
        .map((proposal: ServiceProposal) => {
          const previous = previousProposals.get(proposal.id);
          const existingForm = current[proposal.id];
          const hasManualEdits = existingForm && previous && (
            existingForm.descripcion !== previous.descripcion ||
            existingForm.categoria !== previous.categoria ||
            existingForm.unidad !== previous.unidad ||
            existingForm.idservicio !== (previous.servicioCoincidente ?? "")
          );
          return [proposal.id, hasManualEdits ? existingForm : {
            descripcion: proposal.descripcion,
            categoria: proposal.categoria,
            unidad: proposal.unidad,
            idservicio: proposal.servicioCoincidente ?? "",
          }];
        }),
    ));
  }

  useEffect(() => {
    let active = true;
    fetch("/api/services")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message ?? "No se pudieron cargar los servicios.");
        if (!active) return;
        setServices(result.items);
        setProposals(result.proposals);
        setSource(result.source);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los servicios.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setNotice("");
    setFormOpen(true);
  }

  function startEdit(service: ServiceRecord) {
    setEditingId(service.idservicio);
    setForm({
      descripcion: service.descripcion,
      categoria: service.categoria,
      unidad: service.unidad,
      Valor: String(service.Valor),
    });
    setError("");
    setNotice("");
    setFormOpen(true);
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(editingId ? `/api/services/${editingId}` : "/api/services", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, Valor: Number(form.Valor) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "No se pudo guardar el servicio.");
      await loadServices();
      setFormOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      setNotice(editingId ? "Servicio actualizado." : "Servicio creado.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el servicio.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteService() {
    if (!pendingDelete) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/services/${pendingDelete.idservicio}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "No se pudo eliminar el servicio.");
      setServices((current) => current.filter((service) => service.idservicio !== pendingDelete.idservicio));
      setPendingDelete(null);
      setNotice("Servicio eliminado.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el servicio.");
    } finally {
      setSaving(false);
    }
  }

  async function checkSource(forceComparison = false) {
    setCheckingSource(true);
    setForcingComparison(forceComparison);
    setError("");
    setNotice("");
    try {
      const endpoint = forceComparison ? "/api/services/source-check?force=true" : "/api/services/source-check";
      const response = await fetch(endpoint, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "No se pudo verificar AAIERIC.");
      await loadServices();
      setProposalsModalOpen(true);
      if (forceComparison) {
        setNotice(result.proposalsCreated
          ? `Comparación completada: ${result.proposalsCreated} propuestas nuevas para revisar.`
          : result.proposalsUpdated
            ? `Comparación completada: se actualizaron ${result.proposalsUpdated} propuestas pendientes.`
            : `Comparación completada: se revisaron ${result.extracted} renglones y no hay propuestas nuevas.`);
      } else {
        setNotice(result.changed
          ? `Documento nuevo: ${result.proposalsCreated} propuestas para revisar.`
          : "El documento de AAIERIC no cambió.");
      }
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : "No se pudo verificar AAIERIC.");
    } finally {
      setCheckingSource(false);
      setForcingComparison(false);
    }
  }

  async function reviewProposal(proposal: ServiceProposal, action: "aprobar" | "descartar") {
    setReviewingId(proposal.id);
    setError("");
    setNotice("");
    const proposalForm = proposalForms[proposal.id] ?? {
      descripcion: proposal.descripcion,
      categoria: proposal.categoria,
      unidad: proposal.unidad,
      idservicio: proposal.servicioCoincidente ?? "",
    };
    try {
      const response = await fetch(`/api/services/proposals/${proposal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: action,
          idservicio: proposalForm.idservicio,
          descripcion: proposalForm.descripcion,
          categoria: proposalForm.categoria,
          unidad: proposalForm.unidad,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "No se pudo revisar la propuesta.");
      await loadServices();
      setBulkSkipped((current) => current.filter((item) => item.id !== proposal.id));
      setNotice(action === "aprobar" ? "Cambio aprobado y guardado." : "Propuesta descartada.");
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "No se pudo revisar la propuesta.");
    } finally {
      setReviewingId(null);
    }
  }

  async function approveAllProposals() {
    setApprovingAll(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/services/proposals/approve-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: pendingProposals.map((proposal) => {
            const proposalForm = proposalForms[proposal.id] ?? {
              descripcion: proposal.descripcion,
              categoria: proposal.categoria,
              unidad: proposal.unidad,
              idservicio: proposal.servicioCoincidente ?? "",
            };
            return { id: proposal.id, ...proposalForm };
          }),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "No se pudieron aceptar todas las propuestas.");
      await loadServices();
      const skipped = Array.isArray(result.skipped) ? result.skipped as BulkSkippedProposal[] : [];
      setBulkSkipped(skipped);
      setNotice(skipped.length
        ? `Se aceptaron ${result.approved} valores en servicios.json. ${skipped.length} quedaron pendientes para confirmación manual.`
        : `Se aceptaron ${result.approved} valores y se guardaron en servicios.json.`);
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : "No se pudieron aceptar todas las propuestas.");
    } finally {
      setApprovingAll(false);
    }
  }

  const filteredServices = services.filter((service) =>
    `${service.descripcion} ${service.categoria} ${service.unidad}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const pendingProposals = proposals.filter((proposal) => proposal.estado === "pendiente");

  return (
    <section className="users-admin">
      <header className="users-admin-heading">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN DEL SISTEMA</span>
          <h1>Servicios</h1>
          <p>Gestioná los servicios y revisá los valores sugeridos por AAIERIC.</p>
        </div>
        <div className="users-row-actions">
          <button className="users-cancel-button" disabled={checkingSource} onClick={() => void checkSource()} type="button">
            {checkingSource ? <LoaderCircle aria-hidden="true" className="loading-spinner" size={15} /> : <RefreshCw size={15} />}
            {checkingSource ? forcingComparison ? "Comparando..." : "Consultando..." : "Consultar AAIERIC"}
          </button>
          <button className="users-cancel-button" disabled={checkingSource} onClick={() => void checkSource(true)} type="button">
            {checkingSource && forcingComparison ? <LoaderCircle aria-hidden="true" className="loading-spinner" size={15} /> : <Search size={15} />}
            {checkingSource && forcingComparison ? "Comparando..." : "Forzar comparación"}
          </button>
          <button className="users-create-button" disabled={saving} onClick={startCreate} type="button"><Plus size={16} /> Nuevo servicio</button>
        </div>
      </header>

      <div className="menu-manager-hint">
        {source?.ultimaVerificacion
          ? <>Última consulta: {dateTimeFormatter.format(new Date(source.ultimaVerificacion))}{source.fechaDocumento ? ` · Documento: ${source.fechaDocumento}` : ""}. Los cambios externos requieren aprobación.</>
          : "Todavía no se consultó la lista de costos de AAIERIC. Las propuestas no modifican precios hasta su aprobación."}
      </div>
      {notice && <p className="users-message users-message-success" role="status">{notice}</p>}
      {error && !formOpen && !pendingDelete && <p className="users-message users-message-error" role="alert">{error}</p>}

      <div className="users-table-toolbar">
        <label className="users-search"><Search size={16} /><input onChange={(event) => setQuery(event.target.value)} placeholder="Buscar servicio" value={query} /></label>
        <span>{services.length} {services.length === 1 ? "servicio" : "servicios"}</span>
      </div>
      <div aria-busy={loading} aria-label="Catálogo de servicios" className="services-catalog-scroll" role="region" tabIndex={0}>
        <table className="users-table">
          <thead><tr><th>Servicio</th><th>Categoría</th><th>Unidad</th><th>Valor</th><th>Historial</th><th><span className="visually-hidden">Acciones</span></th></tr></thead>
          <tbody>
            {loading ? <tr><td className="users-empty" colSpan={6}><span className="table-loading" role="status"><LoaderCircle aria-hidden="true" className="loading-spinner" size={17} /> Cargando servicios...</span></td></tr>
              : filteredServices.length ? filteredServices.map((service) => (
                <tr key={service.idservicio}>
                  <td><strong>{service.descripcion}</strong></td>
                  <td>{service.categoria}</td>
                  <td>{service.unidad}</td>
                  <td>{currencyFormatter.format(service.Valor)}</td>
                  <td><details><summary>{service.historial.length} {service.historial.length === 1 ? "cambio" : "cambios"}</summary>
                    <ul>{service.historial.slice().reverse().map((entry, index) => <li key={`${entry.fecha}-${index}`}>
                      {currencyFormatter.format(entry.valorAnterior)} → {currencyFormatter.format(entry.valorNuevo)} · {entry.fuente} · {dateTimeFormatter.format(new Date(entry.fecha))}
                    </li>)}</ul>
                  </details></td>
                  <td><div className="users-row-actions">
                    <button aria-label={`Editar ${service.descripcion}`} className="users-icon-button" onClick={() => startEdit(service)} title="Editar servicio" type="button"><Pencil size={15} /></button>
                    <button aria-label={`Eliminar ${service.descripcion}`} className="users-icon-button users-delete-button" onClick={() => { setError(""); setPendingDelete(service); }} title="Eliminar servicio" type="button"><Trash2 size={15} /></button>
                  </div></td>
                </tr>
              )) : <tr><td className="users-empty" colSpan={6}>{query ? "No hay servicios que coincidan con la búsqueda." : "Todavía no hay servicios."}</td></tr>}
          </tbody>
        </table>
      </div>

      {proposalsModalOpen && <div className="users-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !reviewingId) setProposalsModalOpen(false); }}>
        <section aria-labelledby="service-proposals-title" aria-modal="true" className="users-modal services-review-modal" role="dialog">
          <header className="users-modal-heading modal-heading-warning">
            <div><span className="eyebrow">REVISIÓN MANUAL</span><h2 id="service-proposals-title">Propuestas de AAIERIC</h2><p>{source?.fechaDocumento ? `Documento: ${source.fechaDocumento}. ` : ""}Los valores solo se aplican cuando los aprobás.</p></div>
            <button aria-label="Cerrar propuestas" className="users-icon-button" disabled={Boolean(reviewingId) || approvingAll} onClick={() => setProposalsModalOpen(false)} type="button"><X size={17} /></button>
          </header>
          <div className="services-review-content">
            {notice && <p className="users-message users-message-success" role="status">{notice}</p>}
            {error && <p className="users-message users-message-error" role="alert">{error}</p>}
            {bulkSkipped.length > 0 && <div className="services-bulk-skipped" role="status">
              <strong>Propuestas pendientes de confirmación manual</strong>
              <ul>{bulkSkipped.filter((item) => pendingProposals.some((proposal) => proposal.id === item.id)).map((item) => (
                <li key={item.id}><strong>{item.descripcion}:</strong> {item.reason}</li>
              ))}</ul>
            </div>}
            <header className="services-proposals-heading">
              <div className="budget-section-heading"><h3>Valores para revisar</h3><span>{pendingProposals.length} pendientes</span></div>
              {pendingProposals.length > 0 && <button className="users-save-button" disabled={approvingAll || Boolean(reviewingId)} onClick={() => void approveAllProposals()} type="button">
                {approvingAll ? <LoaderCircle aria-hidden="true" className="loading-spinner" size={15} /> : <CheckCheck size={15} />}
                {approvingAll ? "Aceptando todos..." : "Aceptar todos"}
              </button>}
            </header>
            {pendingProposals.length ? <div aria-label="Valores propuestos por AAIERIC" className="services-proposals-scroll" role="region" tabIndex={0}>
              <table className="users-table">
                <thead><tr><th>Descripción detectada</th><th>Unidad</th><th>Valor actual</th><th>Propuesto</th><th>Variación</th><th>Servicio a actualizar</th><th>Revisión</th></tr></thead>
                <tbody>{pendingProposals.map((proposal) => {
                  const proposalForm = proposalForms[proposal.id] ?? {
                    descripcion: proposal.descripcion,
                    categoria: proposal.categoria,
                    unidad: proposal.unidad,
                    idservicio: proposal.servicioCoincidente ?? "",
                  };
                  const matchedService = services.find((service) => service.idservicio === proposalForm.idservicio);
                  const variation = matchedService && matchedService.Valor !== 0
                    ? ((proposal.Valor - matchedService.Valor) / matchedService.Valor) * 100
                    : null;
                  return <tr key={proposal.id}>
                    <td><input aria-label="Descripción propuesta" maxLength={160} onChange={(event) => setProposalForms((current) => ({ ...current, [proposal.id]: { ...proposalForm, descripcion: event.target.value } }))} value={proposalForm.descripcion} /></td>
                    <td><input aria-label="Unidad del servicio" maxLength={240} onChange={(event) => setProposalForms((current) => ({ ...current, [proposal.id]: { ...proposalForm, unidad: event.target.value } }))} value={proposalForm.unidad} /></td>
                    <td>{matchedService ? currencyFormatter.format(matchedService.Valor) : "—"}</td>
                    <td>{currencyFormatter.format(proposal.Valor)}</td>
                    <td>{variation === null ? "—" : `${variation > 0 ? "+" : ""}${variation.toFixed(2)}%`}</td>
                    <td><select aria-label="Servicio relacionado" onChange={(event) => setProposalForms((current) => ({ ...current, [proposal.id]: { ...proposalForm, idservicio: event.target.value } }))} value={proposalForm.idservicio}>
                      <option value="">Crear como servicio nuevo</option>
                      {services.map((service) => <option key={service.idservicio} value={service.idservicio}>{service.descripcion} · {service.unidad} · {currencyFormatter.format(service.Valor)}</option>)}
                    </select></td>
                    <td className="services-proposal-actions"><div className="users-row-actions">
                      <button aria-label={`Aprobar ${proposal.descripcion}`} className="users-icon-button" disabled={Boolean(reviewingId) || approvingAll} onClick={() => void reviewProposal(proposal, "aprobar")} title="Aprobar valor" type="button"><Check size={15} /></button>
                      <button aria-label={`Descartar ${proposal.descripcion}`} className="users-icon-button users-delete-button" disabled={Boolean(reviewingId) || approvingAll} onClick={() => void reviewProposal(proposal, "descartar")} title="Descartar" type="button">{reviewingId === proposal.id ? <LoaderCircle aria-hidden="true" className="loading-spinner" size={15} /> : <X size={15} />}</button>
                    </div></td>
                  </tr>;
                })}</tbody>
              </table>
            </div> : <p className="budget-inline-hint">La consulta terminó y no hay propuestas pendientes para revisar.</p>}
          </div>
        </section>
      </div>}

      {formOpen && <div className="users-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setFormOpen(false); }}>
        <section aria-labelledby="service-editor-title" aria-modal="true" className="users-modal" role="dialog">
          <header className={`users-modal-heading ${error ? "modal-heading-error" : "modal-heading-info"}`}>
            <div><h2 id="service-editor-title">{editingId ? "Editar servicio" : "Nuevo servicio"}</h2><p>Definí descripción, categoría, unidad y valor.</p></div>
            <button aria-label="Cerrar" className="users-icon-button" disabled={saving} onClick={() => setFormOpen(false)} type="button"><X size={17} /></button>
          </header>
          <form className="user-editor" onSubmit={(event) => void submitForm(event)}>
            <div className="user-editor-fields">
              <label><span>Descripción</span><input autoFocus maxLength={160} onChange={(event) => setForm((current) => ({ ...current, descripcion: event.target.value }))} required value={form.descripcion} /></label>
              <label><span>Categoría</span><input maxLength={80} onChange={(event) => setForm((current) => ({ ...current, categoria: event.target.value }))} required value={form.categoria} /></label>
              <label><span>Unidad</span><input maxLength={240} onChange={(event) => setForm((current) => ({ ...current, unidad: event.target.value }))} required value={form.unidad} /></label>
              <label><span>Valor (ARS)</span><input min="0" onChange={(event) => setForm((current) => ({ ...current, Valor: event.target.value }))} required step="0.01" type="number" value={form.Valor} /></label>
            </div>
            {error && <p className="users-message users-message-error" role="alert">{error}</p>}
            <div className="user-editor-actions">
              <button className="users-cancel-button" disabled={saving} onClick={() => setFormOpen(false)} type="button">Cancelar</button>
              <button className="users-save-button" disabled={saving} type="submit">{saving && <LoaderCircle aria-hidden="true" className="loading-spinner" size={14} />}{saving ? "Guardando..." : "Guardar servicio"}</button>
            </div>
          </form>
        </section>
      </div>}

      {pendingDelete && <div className="users-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setPendingDelete(null); }}>
        <section aria-labelledby="service-delete-title" aria-modal="true" className="users-modal" role="alertdialog">
          <header className="users-modal-heading modal-heading-warning"><div><h2 id="service-delete-title">Eliminar servicio</h2><p>Esta acción no se puede deshacer.</p></div></header>
          <div className="delete-confirmation">
            <p>¿Querés eliminar <strong>{pendingDelete.descripcion}</strong>?</p>
            {error && <p className="users-message users-message-error" role="alert">{error}</p>}
            <div className="user-editor-actions">
              <button className="users-cancel-button" disabled={saving} onClick={() => setPendingDelete(null)} type="button">Cancelar</button>
              <button className="users-confirm-delete" disabled={saving} onClick={() => void deleteService()} type="button">{saving && <LoaderCircle aria-hidden="true" className="loading-spinner" size={14} />}{saving ? "Eliminando..." : "Eliminar servicio"}</button>
            </div>
          </div>
        </section>
      </div>}
    </section>
  );
}
