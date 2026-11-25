"use client";

import { FolderPlus, GripVertical, LoaderCircle, Pencil, Plus, Save, Settings2, Trash2, X } from "lucide-react";
import { useEffect, useState, type CSSProperties, type DragEvent, type FormEvent } from "react";
import { menuDestinations, menuIcons, type MenuDestination, type MenuItem, type MenuProfile } from "@/lib/menu";

type MenuForm = {
  label: string;
  icon: string;
  profiles: MenuProfile[];
  destination: MenuDestination | null;
  parentId: string | null;
};

const emptyForm: MenuForm = { label: "", icon: "home", profiles: ["Admin"], destination: "calendar", parentId: null };

function findMenuItem(items: MenuItem[], id: string): MenuItem | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    const found = item.children && findMenuItem(item.children, id);
    if (found) return found;
  }
}

function getParentId(items: MenuItem[], id: string, parentId: string | null = null): string | null | undefined {
  for (const item of items) {
    if (item.id === id) return parentId;
    const found = item.children && getParentId(item.children, id, item.id);
    if (found !== undefined) return found;
  }
}

function updateMenuItem(items: MenuItem[], id: string, update: (item: MenuItem) => MenuItem): MenuItem[] {
  return items.map((item) => item.id === id
    ? update(item)
    : item.children ? { ...item, children: updateMenuItem(item.children, id, update) } : item);
}

function removeMenuItem(items: MenuItem[], id: string): MenuItem[] {
  return items.flatMap((item) => item.id === id
    ? []
    : [{ ...item, ...(item.children ? { children: removeMenuItem(item.children, id) } : {}) }]);
}

function containsMenuItem(item: MenuItem, id: string): boolean {
  return item.id === id || Boolean(item.children?.some((child) => containsMenuItem(child, id)));
}

function moveMenuItem(items: MenuItem[], sourceId: string, targetId: string | null, position: "before" | "after" | "inside"): MenuItem[] | null {
  const source = findMenuItem(items, sourceId);
  const target = targetId ? findMenuItem(items, targetId) : undefined;
  if (!source || ["services", "menu-management", "profile-management", "stock"].includes(sourceId) || (targetId && ["services", "menu-management", "profile-management", "stock"].includes(targetId))) return null;
  const movingItem = source;
  if (target && containsMenuItem(source, target.id)) return null;
  if (sourceId === "administration" && (position === "inside" || (target && getParentId(items, target.id) !== null))) return null;
  if (sourceId !== "administration" && targetId === "administration" && position !== "inside") return null;
  if (sourceId === "administration" && targetId && !target) return null;

  const remaining = removeMenuItem(items, sourceId);
  if (!targetId) return [...remaining, source];

  let inserted = false;
  function insert(nodes: MenuItem[]): MenuItem[] {
    return nodes.flatMap((item) => {
      if (item.id === targetId) {
        if (position === "inside") {
          inserted = true;
          return [{ ...item, destination: null, children: [...(item.children ?? []), movingItem] }];
        }
        if (item.id === "administration") return [item];
        inserted = true;
        return position === "before" ? [movingItem, item] : [item, movingItem];
      }
      if (item.children) return [{ ...item, children: insert(item.children) }];
      return [item];
    });
  }

  const result = insert(remaining);
  return inserted ? result : null;
}

export default function MenusAdmin({ onSaved }: { onSaved: (items: MenuItem[]) => void }) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [profiles, setProfiles] = useState<MenuProfile[]>(["Admin", "Operario"]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState<MenuForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MenuItem | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([fetch("/api/menu"), fetch("/api/profiles")])
      .then(async ([menuResponse, profilesResponse]) => {
        const [menuResult, profilesResult] = await Promise.all([menuResponse.json(), profilesResponse.json()]);
        if (!menuResponse.ok) throw new Error(menuResult.message ?? "No se pudo cargar el menú.");
        if (!profilesResponse.ok) throw new Error(profilesResult.message ?? "No se pudieron cargar los perfiles.");
        if (active) {
          setItems(menuResult.items);
          setProfiles(profilesResult.items);
        }
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el menú.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function startCreate(parentId: string | null = null) {
    setEditingId(null);
    setError("");
    setNotice("");
    setForm({ ...emptyForm, parentId, destination: parentId ? null : "calendar" });
    setFormOpen(true);
  }

  function startEdit(item: MenuItem) {
    setEditingId(item.id);
    setError("");
    setNotice("");
    setForm({
      label: item.label,
      icon: item.icon,
      profiles: item.profiles,
      destination: item.destination,
      parentId: getParentId(items, item.id) ?? null,
    });
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function persistMenu(nextItems: MenuItem[]) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/menu", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: nextItems }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "No se pudo guardar el menú.");
      setItems(result.items);
      onSaved(result.items);
      setNotice("Cambios guardados.");
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el menú.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function updateFormProfile(profile: MenuProfile) {
    setForm((current) => {
      const nextProfiles = current.profiles.includes(profile)
        ? current.profiles.filter((item) => item !== profile)
        : [...current.profiles, profile];
      const selectedDestination = menuDestinations.find((item) => item.value === current.destination);
      return {
        ...current,
        profiles: nextProfiles,
        destination: selectedDestination?.adminOnly && nextProfiles.some((item) => item !== "Admin") ? null : current.destination,
      };
    });
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.profiles.length) {
      setError("Seleccioná al menos un perfil.");
      return;
    }
    if (editingId === "administration" || editingId === "menu-management") return;
    if (form.parentId && form.profiles.some((profile) => !findMenuItem(items, form.parentId!)?.profiles.includes(profile))) {
      setError("El perfil del nodo debe estar habilitado también en su submenú contenedor.");
      return;
    }

    let nextItems: MenuItem[];
    if (editingId) {
      const currentItem = findMenuItem(items, editingId);
      if (!currentItem) return;
      const currentParentId = getParentId(items, editingId) ?? null;
      if (currentParentId !== form.parentId) {
        const moved = moveMenuItem(items, editingId, form.parentId, "inside");
        if (!moved) {
          setError("No se pudo mover el nodo a esa ubicación.");
          return;
        }
        nextItems = moved;
      } else nextItems = items;
      nextItems = updateMenuItem(nextItems, editingId, (item) => ({
        ...item,
        label: form.label.trim(),
        icon: form.icon,
        profiles: form.profiles,
        destination: item.children?.length ? null : form.destination,
      }));
    } else {
      const newItem: MenuItem = {
        id: crypto.randomUUID(),
        label: form.label.trim(),
        icon: form.icon,
        profiles: form.profiles,
        destination: form.destination,
        ...(form.destination === null ? { children: [] } : {}),
      };
      if (form.parentId) {
        const parent = findMenuItem(items, form.parentId);
        if (!parent || form.parentId === "menu-management") {
          setError("Seleccioná un contenedor válido.");
          return;
        }
        nextItems = updateMenuItem(items, parent.id, (item) => ({
          ...item,
          destination: null,
          children: [...(item.children ?? []), newItem],
        }));
      } else {
        nextItems = [...items, newItem];
      }
    }

    if (await persistMenu(nextItems)) closeForm();
  }

  async function deleteItem() {
    if (!pendingDelete) return;
    const nextItems = removeMenuItem(items, pendingDelete.id);
    if (await persistMenu(nextItems)) setPendingDelete(null);
  }

  function handleDragStart(event: DragEvent<HTMLDivElement>, id: string) {
    if (id === "menu-management") {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    setDraggedId(id);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, targetId: string | null, position: "before" | "after" | "inside") {
    event.preventDefault();
    event.stopPropagation();
    const sourceId = event.dataTransfer.getData("text/plain") || draggedId;
    setDropTarget(null);
    setDraggedId(null);
    if (!sourceId) return;
    const nextItems = moveMenuItem(items, sourceId, targetId, position);
    if (nextItems) void persistMenu(nextItems);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>, targetId: string | null) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDropTarget(targetId ?? "root");
  }

  const parentOptions: { id: string; label: string; depth: number }[] = [];
  const editedNode = editingId ? findMenuItem(items, editingId) : undefined;
  function collectParents(nodes: MenuItem[], depth = 0) {
    for (const item of nodes) {
      if (!["services", "menu-management", "profile-management", "stock"].includes(item.id) && (!editedNode || !containsMenuItem(editedNode, item.id))) {
        parentOptions.push({ id: item.id, label: item.label, depth });
      }
      if (item.children) collectParents(item.children, depth + 1);
    }
  }
  collectParents(items);

  const selectedDestination = menuDestinations.find((item) => item.value === form.destination);
  const availableDestinations = menuDestinations.filter((item) => item.value !== "stock" && (!item.adminOnly || (form.profiles.length === 1 && form.profiles[0] === "Admin")));

  function renderBranch(item: MenuItem, depth: number, parentLabel: string) {
    const isLocked = item.id === "administration" || item.id === "menu-management" || item.id === "profile-management" || item.id === "services" || item.id === "stock";
    const isGroup = item.destination === null || Boolean(item.children?.length);
    return (
      <div className="menu-tree-branch" key={item.id}>
        <div
          className={`menu-tree-node ${dropTarget === item.id ? "menu-tree-node-drop" : ""} ${draggedId === item.id ? "menu-tree-node-dragging" : ""}`}
          draggable={!isLocked && !saving}
          onDragEnd={() => { setDraggedId(null); setDropTarget(null); }}
          onDragOver={(event) => handleDragOver(event, item.id)}
          onDragStart={(event) => handleDragStart(event, item.id)}
          onDrop={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const relativeY = (event.clientY - bounds.top) / bounds.height;
            handleDrop(event, item.id, relativeY < 0.25 ? "before" : relativeY > 0.75 ? "after" : "inside");
          }}
          style={{ "--menu-depth": depth } as CSSProperties}
        >
          <GripVertical aria-hidden="true" className={`menu-tree-grip ${isLocked ? "menu-tree-grip-locked" : ""}`} size={17} />
          <div className="menu-tree-copy">
            <strong>{item.label}</strong>
            <span>{isGroup ? "Submenú" : menuDestinations.find((destination) => destination.value === item.destination)?.label ?? "Sin referencia"} · {parentLabel}</span>
          </div>
          <div className="menu-tree-badges">
            {item.profiles.map((profile) => <span className={`profile-badge ${profile === "Admin" ? "profile-admin" : "profile-operator"}`} key={profile}>{profile}</span>)}
          </div>
          {!isLocked && <div className="menu-tree-actions">
            <button aria-label={`Agregar submenú en ${item.label}`} className="users-icon-button" disabled={saving} onClick={() => startCreate(item.id)} title="Agregar submenú" type="button"><FolderPlus size={16} /></button>
            <button aria-label={`Editar ${item.label}`} className="users-icon-button" disabled={saving} onClick={() => startEdit(item)} title="Editar" type="button"><Pencil size={15} /></button>
            <button aria-label={`Eliminar ${item.label}`} className="users-icon-button users-delete-button" disabled={saving} onClick={() => setPendingDelete(item)} title="Eliminar" type="button"><Trash2 size={15} /></button>
          </div>}
          {isLocked && <span className="menu-tree-system-label"><Settings2 size={13} /> Sistema</span>}
        </div>
        {item.children?.map((child) => renderBranch(child, depth + 1, item.label))}
      </div>
    );
  }

  return (
    <section className="users-admin menus-admin">
      <header className="users-admin-heading">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN DEL SISTEMA</span>
          <h1>Menús</h1>
          <p>Organizá las opciones, perfiles y destinos del menú lateral.</p>
        </div>
        <button className="users-create-button" disabled={saving} onClick={() => startCreate()} type="button"><Plus size={16} /> Nuevo nodo</button>
      </header>

      <div className="menu-manager-hint"><GripVertical aria-hidden="true" size={16} /><span>Arrastrá los nodos: soltá en los bordes para reordenar y en el centro para crear un submenú.</span></div>
      {notice && <p className="users-message users-message-success" role="status">{notice}</p>}
      {error && !formOpen && !pendingDelete && <p className="users-message users-message-error" role="alert">{error}</p>}

      <div
        className={`menu-tree ${dropTarget === "root" ? "menu-tree-root-drop" : ""}`}
        onDragOver={(event) => handleDragOver(event, null)}
        onDrop={(event) => handleDrop(event, null, "inside")}
      >
        {loading ? <p className="menu-tree-empty"><LoaderCircle aria-hidden="true" className="loading-spinner" size={17} /> Cargando menú...</p>
          : items.length ? items.map((item) => renderBranch(item, 0, "Menú principal"))
            : <p className="menu-tree-empty">No hay nodos configurados.</p>}
      </div>

      {formOpen && <div className="users-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }}>
        <section aria-labelledby="menu-editor-title" aria-modal="true" className="users-modal" role="dialog">
          <header className={`users-modal-heading ${error ? "modal-heading-error" : "modal-heading-info"}`}>
            <div><h2 id="menu-editor-title">{editingId ? "Editar nodo" : "Nuevo nodo"}</h2><p>Definí cómo se muestra y a qué sección dirige.</p></div>
            <button aria-label="Cerrar" className="users-icon-button" disabled={saving} onClick={closeForm} type="button"><X size={17} /></button>
          </header>
          <form className="menu-editor" onSubmit={(event) => void submitForm(event)}>
            <div className="menu-editor-fields">
              <label><span>Nombre</span><input autoFocus maxLength={50} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} required value={form.label} /></label>
              <label><span>Ícono</span><select onChange={(event) => setForm((current) => ({ ...current, icon: event.target.value }))} value={form.icon}>{menuIcons.map((icon) => <option key={icon.value} value={icon.value}>{icon.label}</option>)}</select></label>
              <label><span>Ubicación</span>
                <select onChange={(event) => setForm((current) => ({ ...current, parentId: event.target.value || null }))} value={form.parentId ?? ""}>
                  <option value="">Menú principal</option>
                  {parentOptions.map((option) => <option key={option.id} value={option.id}>{"— ".repeat(option.depth)}{option.label}</option>)}
                </select>
              </label>
              <label><span>Destino</span>
                <select
                  disabled={Boolean(editingId && findMenuItem(items, editingId)?.children?.length)}
                  onChange={(event) => setForm((current) => ({ ...current, destination: event.target.value ? event.target.value as MenuDestination : null }))}
                  value={form.destination ?? ""}
                >
                  <option value="">Submenú / contenedor</option>
                  {availableDestinations.map((destination) => <option key={destination.value} value={destination.value}>{destination.label}</option>)}
                </select>
              </label>
            </div>
            {editingId && findMenuItem(items, editingId)?.children?.length ? <p className="menu-editor-note">Este nodo contiene submenús, por eso funciona como contenedor.</p> : null}
            {selectedDestination?.adminOnly && <p className="menu-editor-note">Este destino requiere el perfil Admin.</p>}
            <fieldset className="menu-profile-options">
              <legend>Perfiles con acceso</legend>
              {profiles.map((profile) => (
                <label key={profile}><input checked={form.profiles.includes(profile)} onChange={() => updateFormProfile(profile)} type="checkbox" />{profile}</label>
              ))}
            </fieldset>
            {error && <p className="users-message users-message-error" role="alert">{error}</p>}
            <div className="user-editor-actions">
              <button className="users-cancel-button" disabled={saving} onClick={closeForm} type="button">Cancelar</button>
              <button className="users-save-button" disabled={saving} type="submit">{saving ? <LoaderCircle aria-hidden="true" className="loading-spinner" size={14} /> : <Save aria-hidden="true" size={14} />}{saving ? "Guardando..." : "Guardar nodo"}</button>
            </div>
          </form>
        </section>
      </div>}

      {pendingDelete && <div className="users-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setPendingDelete(null); }}>
        <section aria-labelledby="menu-delete-title" aria-modal="true" className="users-modal" role="alertdialog">
          <header className="users-modal-heading modal-heading-warning"><div><h2 id="menu-delete-title">Eliminar nodo</h2><p>Se eliminarán también sus submenús.</p></div></header>
          <div className="delete-confirmation">
            <p>¿Querés eliminar <strong>{pendingDelete.label}</strong> y todo su contenido?</p>
            {error && <p className="users-message users-message-error" role="alert">{error}</p>}
            <div className="user-editor-actions">
              <button className="users-cancel-button" disabled={saving} onClick={() => setPendingDelete(null)} type="button">Cancelar</button>
              <button className="users-confirm-delete" disabled={saving} onClick={() => void deleteItem()} type="button">{saving ? "Eliminando..." : "Eliminar nodo"}</button>
            </div>
          </div>
        </section>
      </div>}
    </section>
  );
}
