"use client";

import { LoaderCircle, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

type ManagedUser = {
  idusuario: string;
  usuario: string;
  perfil: "Admin" | "Operario";
};

type UserForm = {
  usuario: string;
  password: string;
  perfil: ManagedUser["perfil"];
};

const emptyForm: UserForm = { usuario: "", password: "", perfil: "Operario" };

export default function UsersAdmin() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ManagedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/users");
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "No se pudo cargar usuarios.");
      setUsers(result.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar usuarios.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/users")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message ?? "No se pudo cargar usuarios.");
        if (active) setUsers(result.items);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "No se pudo cargar usuarios.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setNotice("");
    setFormOpen(true);
  }

  function startEdit(user: ManagedUser) {
    setEditingId(user.idusuario);
    setForm({ usuario: user.usuario, password: "", perfil: user.perfil });
    setError("");
    setNotice("");
    setFormOpen(true);
  }

  const closeForm = useCallback(() => {
    if (saving) return;
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }, [saving]);

  const closeDeleteModal = useCallback(() => {
    if (!deleting) setPendingDelete(null);
  }, [deleting]);

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(editingId ? `/api/users/${editingId}` : "/api/users", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usuario: form.usuario,
          perfil: form.perfil,
          password: form.password,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "No se pudo guardar el usuario.");

      await loadUsers();
      closeForm();
      setNotice(editingId ? "Usuario actualizado." : "Usuario creado.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el usuario.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteUser() {
    if (!pendingDelete) return;
    setDeleting(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/users/${pendingDelete.idusuario}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "No se pudo eliminar el usuario.");
      setUsers((current) => current.filter((item) => item.idusuario !== pendingDelete.idusuario));
      setPendingDelete(null);
      setNotice("Usuario eliminado.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el usuario.");
    } finally {
      setDeleting(false);
    }
  }

  const filteredUsers = users.filter((user) =>
    user.usuario.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );

  return (
    <section className="users-admin">
      <header className="users-admin-heading">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN DEL SISTEMA</span>
          <h1>Usuarios</h1>
          <p>Gestioná las cuentas y perfiles de acceso.</p>
        </div>
        <button className="users-create-button" onClick={startCreate} type="button">
          <Plus size={16} /> Nuevo usuario
        </button>
      </header>

      {formOpen && (
        <Modal
          description="Completá los datos de acceso."
          onClose={closeForm}
          title={editingId ? "Editar usuario" : "Nuevo usuario"}
          variant={error ? "error" : "info"}
        >
          <form className="user-editor" onSubmit={submitForm}>
            <div className="user-editor-fields">
              <label>
                <span>Usuario</span>
                <input autoComplete="off" autoFocus maxLength={64} onChange={(event) => setForm((value) => ({ ...value, usuario: event.target.value }))} required value={form.usuario} />
              </label>
              <label>
                <span>{editingId ? "Nueva contraseña" : "Contraseña"}</span>
                <input autoComplete="new-password" minLength={8} onChange={(event) => setForm((value) => ({ ...value, password: event.target.value }))} required type="password" value={form.password} />
              </label>
              <label>
                <span>Perfil</span>
                <select onChange={(event) => setForm((value) => ({ ...value, perfil: event.target.value as ManagedUser["perfil"] }))} required value={form.perfil}>
                  <option value="Admin">Admin</option>
                  <option value="Operario">Operario</option>
                </select>
              </label>
            </div>
            {error && <p className="users-message users-message-error" role="alert">{error}</p>}
            <div className="user-editor-actions">
              <button className="users-cancel-button" disabled={saving} onClick={closeForm} type="button">Cancelar</button>
              <button className="users-save-button" disabled={saving} type="submit">{saving && <LoaderCircle aria-hidden="true" className="loading-spinner" size={14} />}{saving ? "Guardando..." : "Guardar usuario"}</button>
            </div>
          </form>
        </Modal>
      )}

      {pendingDelete && (
        <Modal description="Esta acción no se puede deshacer." onClose={closeDeleteModal} title="Eliminar usuario" variant={error ? "error" : "warning"}>
          <div className="delete-confirmation">
            <p>¿Querés eliminar la cuenta <strong>{pendingDelete.usuario}</strong>?</p>
            {error && <p className="users-message users-message-error" role="alert">{error}</p>}
            <div className="user-editor-actions">
              <button className="users-cancel-button" disabled={deleting} onClick={closeDeleteModal} type="button">Cancelar</button>
              <button className="users-confirm-delete" disabled={deleting} onClick={() => void confirmDeleteUser()} type="button">{deleting && <LoaderCircle aria-hidden="true" className="loading-spinner" size={14} />}{deleting ? "Eliminando..." : "Eliminar usuario"}</button>
            </div>
          </div>
        </Modal>
      )}

      {notice && <p className="users-message users-message-success" role="status">{notice}</p>}
      {!formOpen && error && <p className="users-message users-message-error" role="alert">{error}</p>}

      <div className="users-table-toolbar">
        <label className="users-search">
          <Search size={16} />
          <input onChange={(event) => setQuery(event.target.value)} placeholder="Buscar usuario" value={query} />
        </label>
        <span>{users.length} {users.length === 1 ? "usuario" : "usuarios"}</span>
      </div>

      <div aria-busy={loading} className="users-table-scroll">
        <table className="users-table">
          <thead><tr><th>Usuario</th><th>Perfil</th><th><span className="visually-hidden">Acciones</span></th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td className="users-empty" colSpan={3}><span className="table-loading" role="status"><LoaderCircle aria-hidden="true" className="loading-spinner" size={17} /> Cargando usuarios...</span></td></tr>
            ) : filteredUsers.length ? filteredUsers.map((user) => (
              <tr key={user.idusuario}>
                <td><span className="users-name-cell"><span className="users-avatar">{user.usuario.slice(0, 1).toUpperCase()}</span><strong>{user.usuario}</strong></span></td>
                <td><span className={`profile-badge ${user.perfil === "Admin" ? "profile-admin" : "profile-operator"}`}>{user.perfil}</span></td>
                <td><div className="users-row-actions">
                  <button aria-label={`Editar ${user.usuario}`} className="users-icon-button" onClick={() => startEdit(user)} title="Editar usuario" type="button"><Pencil size={15} /></button>
                  <button aria-label={`Eliminar ${user.usuario}`} className="users-icon-button users-delete-button" onClick={() => { setError(""); setPendingDelete(user); }} title="Eliminar usuario" type="button"><Trash2 size={15} /></button>
                </div></td>
              </tr>
            )) : (
              <tr><td className="users-empty" colSpan={3}>{query ? "No hay usuarios que coincidan con la búsqueda." : "Todavía no hay usuarios."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Modal({
  children,
  description,
  onClose,
  title,
  variant = "info",
}: {
  children: ReactNode;
  description: string;
  onClose: () => void;
  title: string;
  variant?: "info" | "warning" | "error" | "success";
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusableSelector = "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector);
    focusables?.[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const currentFocusables = dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector);
      if (!currentFocusables.length) return;
      const first = currentFocusables[0];
      const last = currentFocusables[currentFocusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="users-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-labelledby="users-modal-title"
        aria-modal="true"
        className="users-modal"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={`users-modal-heading modal-heading-${variant}`}>
          <div><h2 id="users-modal-title">{title}</h2><p>{description}</p></div>
          <button aria-label="Cerrar modal" className="users-icon-button" onClick={onClose} type="button"><X size={17} /></button>
        </header>
        {children}
      </div>
    </div>
  );
}