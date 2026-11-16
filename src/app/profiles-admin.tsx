"use client";

import { LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

const protectedProfiles = ["Admin", "Operario"];

export default function ProfilesAdmin() {
  const [profiles, setProfiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/profiles")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message ?? "No se pudieron cargar los perfiles.");
        if (active) setProfiles(result.items);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los perfiles.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function startCreate() {
    setEditing(null);
    setName("");
    setError("");
    setNotice("");
    setFormOpen(true);
  }

  function startEdit(profile: string) {
    setEditing(profile);
    setName(profile);
    setError("");
    setNotice("");
    setFormOpen(true);
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(editing ? `/api/profiles/${encodeURIComponent(editing)}` : "/api/profiles", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: name }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "No se pudo guardar el perfil.");
      setProfiles(result.items);
      setFormOpen(false);
      setNotice(editing ? "Perfil actualizado." : "Perfil creado.");
      setEditing(null);
      setName("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el perfil.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteProfile(profile: string) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/profiles/${encodeURIComponent(profile)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "No se pudo eliminar el perfil.");
      setProfiles(result.items);
      setPendingDelete(null);
      setNotice("Perfil eliminado.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el perfil.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="users-admin">
      <header className="users-admin-heading">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN DEL SISTEMA</span>
          <h1>Perfiles</h1>
          <p>Administrá los perfiles disponibles para usuarios y opciones del menú.</p>
        </div>
        <button className="users-create-button" disabled={saving} onClick={startCreate} type="button"><Plus size={16} /> Nuevo perfil</button>
      </header>

      <p className="menu-manager-hint">Los perfiles personalizados controlan la visibilidad del menú; no otorgan permisos de administración. Admin y Operario son perfiles protegidos.</p>
      {notice && <p className="users-message users-message-success" role="status">{notice}</p>}
      {error && !formOpen && !pendingDelete && <p className="users-message users-message-error" role="alert">{error}</p>}

      <div aria-busy={loading} className="users-table-scroll">
        <table className="users-table">
          <thead><tr><th>Perfil</th><th>Tipo</th><th><span className="visually-hidden">Acciones</span></th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td className="users-empty" colSpan={3}><span className="table-loading" role="status"><LoaderCircle aria-hidden="true" className="loading-spinner" size={17} /> Cargando perfiles...</span></td></tr>
            ) : profiles.map((profile) => {
              const isProtected = protectedProfiles.includes(profile);
              return (
                <tr key={profile}>
                  <td><span className={`profile-badge ${profile === "Admin" ? "profile-admin" : "profile-operator"}`}>{profile}</span></td>
                  <td>{isProtected ? "Sistema" : "Personalizado"}</td>
                  <td><div className="users-row-actions">
                    {!isProtected && <>
                      <button aria-label={`Editar ${profile}`} className="users-icon-button" onClick={() => startEdit(profile)} title="Editar perfil" type="button"><Pencil size={15} /></button>
                      <button aria-label={`Eliminar ${profile}`} className="users-icon-button users-delete-button" onClick={() => { setError(""); setPendingDelete(profile); }} title="Eliminar perfil" type="button"><Trash2 size={15} /></button>
                    </>}
                  </div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {formOpen && <div className="users-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setFormOpen(false); }}>
        <section aria-labelledby="profile-editor-title" aria-modal="true" className="users-modal" role="dialog">
          <header className={`users-modal-heading ${error ? "modal-heading-error" : "modal-heading-info"}`}>
            <div><h2 id="profile-editor-title">{editing ? "Editar perfil" : "Nuevo perfil"}</h2><p>El perfil solo determina la visibilidad de las opciones del menú.</p></div>
            <button aria-label="Cerrar" className="users-icon-button" disabled={saving} onClick={() => setFormOpen(false)} type="button"><X size={17} /></button>
          </header>
          <form className="user-editor" onSubmit={(event) => void submitForm(event)}>
            <label><span>Nombre</span><input autoFocus maxLength={40} onChange={(event) => setName(event.target.value)} required value={name} /></label>
            {error && <p className="users-message users-message-error" role="alert">{error}</p>}
            <div className="user-editor-actions">
              <button className="users-cancel-button" disabled={saving} onClick={() => setFormOpen(false)} type="button">Cancelar</button>
              <button className="users-save-button" disabled={saving} type="submit">{saving && <LoaderCircle aria-hidden="true" className="loading-spinner" size={14} />}{saving ? "Guardando..." : "Guardar perfil"}</button>
            </div>
          </form>
        </section>
      </div>}

      {pendingDelete && <div className="users-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setPendingDelete(null); }}>
        <section aria-labelledby="profile-delete-title" aria-modal="true" className="users-modal" role="alertdialog">
          <header className="users-modal-heading modal-heading-warning"><div><h2 id="profile-delete-title">Eliminar perfil</h2><p>Esta acción no se puede deshacer.</p></div></header>
          <div className="delete-confirmation">
            <p>¿Querés eliminar el perfil <strong>{pendingDelete}</strong>?</p>
            {error && <p className="users-message users-message-error" role="alert">{error}</p>}
            <div className="user-editor-actions">
              <button className="users-cancel-button" disabled={saving} onClick={() => setPendingDelete(null)} type="button">Cancelar</button>
              <button className="users-confirm-delete" disabled={saving} onClick={() => void deleteProfile(pendingDelete)} type="button">{saving && <LoaderCircle aria-hidden="true" className="loading-spinner" size={14} />}{saving ? "Eliminando..." : "Eliminar perfil"}</button>
            </div>
          </div>
        </section>
      </div>}
    </section>
  );
}
