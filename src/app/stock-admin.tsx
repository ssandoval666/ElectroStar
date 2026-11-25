"use client";

import { LoaderCircle, Package, Pencil, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { ProductRecord } from "@/app/api/products/route";
import type { StockRecord } from "@/lib/stock";

type StockForm = { idproducto: string; cantidad: string };
type StockItem = StockRecord & { product?: ProductRecord };
const emptyForm: StockForm = { idproducto: "", cantidad: "" };
const currencyFormatter = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const quantityFormatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 6 });

export default function StockAdmin() {
  const [items, setItems] = useState<StockRecord[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [form, setForm] = useState<StockForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StockItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadStock = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/stock");
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "No se pudo cargar el inventario.");
      setItems(result.items);
      setProducts(result.products);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el inventario.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/stock")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message ?? "No se pudo cargar el inventario.");
        if (active) {
          setItems(result.items);
          setProducts(result.products);
        }
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el inventario.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  const productById = useMemo(() => new Map(products.map((product) => [product.idproducto, product])), [products]);
  const availableProducts = useMemo(() => {
    const registeredIds = new Set(items.map((item) => item.idproducto));
    return products.filter((product) => !registeredIds.has(product.idproducto));
  }, [items, products]);
  const cards: StockItem[] = items.map((item) => ({ ...item, product: productById.get(item.idproducto) }));

  function startCreate() {
    setEditingId(null);
    setForm({ idproducto: availableProducts[0]?.idproducto ?? "", cantidad: "" });
    setError("");
    setNotice("");
    setFormOpen(true);
  }

  function startEdit(item: StockItem) {
    setEditingId(item.idproducto);
    setForm({ idproducto: item.idproducto, cantidad: String(item.cantidad) });
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
    if (deleting) return;
    setPendingDelete(null);
    setError("");
  }, [deleting]);

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(editingId ? `/api/stock/${encodeURIComponent(editingId)}` : "/api/stock", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingId ? {} : { idproducto: form.idproducto }),
          cantidad: Number(form.cantidad),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "No se pudo guardar el inventario.");
      setFormOpen(false);
      setEditingId(null);
      setNotice(editingId ? "Cantidad actualizada." : "Producto agregado al inventario.");
      await loadStock();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el inventario.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/stock/${encodeURIComponent(pendingDelete.idproducto)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "No se pudo quitar el producto del inventario.");
      setPendingDelete(null);
      setNotice("Producto quitado del inventario.");
      await loadStock();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo quitar el producto del inventario.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="users-admin stock-admin">
      <header className="users-admin-heading">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN DEL SISTEMA</span>
          <h1>Stock</h1>
          <p>Consultá y actualizá las cantidades disponibles de tus productos.</p>
        </div>
        <button className="users-create-button" disabled={loading || availableProducts.length === 0} onClick={startCreate} type="button">
          <Plus size={16} /> Nuevo registro
        </button>
      </header>

      {notice && <p className="users-message users-message-success" role="status">{notice}</p>}
      {!formOpen && !pendingDelete && error && <p className="users-message users-message-error" role="alert">{error}</p>}

      <div className="users-table-toolbar">
        <span>{items.length} {items.length === 1 ? "producto en stock" : "productos en stock"}</span>
      </div>

      {!loading && products.length === 0 && <p className="stock-empty-hint">Primero agregá productos desde la sección Productos para poder registrarlos en el stock.</p>}
      {!loading && products.length > 0 && availableProducts.length === 0 && <p className="stock-empty-hint">Todos los productos del catálogo ya están cargados en el stock.</p>}

      <div aria-busy={loading} className="stock-cards">
        {loading ? (
          <p className="budget-cards-message"><LoaderCircle aria-hidden="true" className="loading-spinner" size={17} /> Cargando inventario...</p>
        ) : cards.length ? cards.map((item) => (
          <article className="budget-card stock-card" key={item.idproducto}>
            <header className="budget-card-heading">
              <div><span className="eyebrow">PRODUCTO</span><h2>{item.product?.descripcion ?? "Producto no disponible"}</h2></div>
              <Package aria-hidden="true" className="stock-card-icon" size={21} />
            </header>
            <div className="budget-card-summary stock-card-summary">
              <div><span>Cantidad disponible</span><strong>{quantityFormatter.format(item.cantidad)}</strong></div>
              <div className="budget-card-total"><span>Valor actual en catálogo</span><strong>{item.product ? currencyFormatter.format(item.product.Valor) : "—"}</strong></div>
            </div>
            <p className="stock-card-reference">Vinculado al catálogo por ID de producto</p>
            <div className="budget-card-actions">
              <button aria-label={`Editar cantidad de ${item.product?.descripcion ?? "producto"}`} className="budget-card-action" onClick={() => startEdit(item)} type="button"><Pencil size={14} /> Editar</button>
              <button aria-label={`Quitar ${item.product?.descripcion ?? "producto"} del stock`} className="budget-card-action budget-card-delete" onClick={() => { setError(""); setPendingDelete(item); }} type="button"><Trash2 size={14} /> Quitar</button>
            </div>
          </article>
        )) : (
          <p className="budget-cards-message">Todavía no hay productos cargados en el stock.</p>
        )}
      </div>

      {formOpen && (
        <StockModal description="Vinculá un producto del catálogo y registrá su cantidad disponible." onClose={closeForm} title={editingId ? "Editar cantidad" : "Agregar al stock"}>
          <form className="product-editor" onSubmit={(event) => void submitForm(event)}>
            <div className="product-editor-fields stock-editor-fields">
              <label>
                <span>Producto</span>
                <select disabled={Boolean(editingId)} onChange={(event) => setForm((current) => ({ ...current, idproducto: event.target.value }))} required value={form.idproducto}>
                  <option value="">Seleccioná un producto</option>
                  {(editingId ? products.filter((product) => product.idproducto === editingId) : availableProducts).map((product) => (
                    <option key={product.idproducto} value={product.idproducto}>{product.descripcion}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Cantidad disponible</span>
                <input autoFocus={!editingId} min="0" onChange={(event) => setForm((current) => ({ ...current, cantidad: event.target.value }))} required step="any" type="number" value={form.cantidad} />
              </label>
            </div>
            {error && <p className="users-message users-message-error" role="alert">{error}</p>}
            <div className="user-editor-actions">
              <button className="users-cancel-button" disabled={saving} onClick={closeForm} type="button">Cancelar</button>
              <button className="users-save-button" disabled={saving} type="submit">{saving && <LoaderCircle aria-hidden="true" className="loading-spinner" size={14} />}{saving ? "Guardando..." : "Guardar"}</button>
            </div>
          </form>
        </StockModal>
      )}

      {pendingDelete && (
        <StockModal description="El producto seguirá disponible en el catálogo." onClose={closeDeleteModal} title="Quitar del stock" variant="warning">
          <div className="delete-confirmation">
            <p>¿Querés quitar <strong>{pendingDelete.product?.descripcion ?? "este producto"}</strong> del inventario?</p>
            {error && <p className="users-message users-message-error" role="alert">{error}</p>}
            <div className="user-editor-actions">
              <button className="users-cancel-button" disabled={deleting} onClick={closeDeleteModal} type="button">Cancelar</button>
              <button className="users-confirm-delete" disabled={deleting} onClick={() => void confirmDelete()} type="button">{deleting && <LoaderCircle aria-hidden="true" className="loading-spinner" size={14} />}{deleting ? "Quitando..." : "Quitar del stock"}</button>
            </div>
          </div>
        </StockModal>
      )}
    </section>
  );
}

function StockModal({
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
  variant?: "info" | "warning";
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const selector = "button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])";
    dialogRef.current?.querySelectorAll<HTMLElement>(selector)[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(selector);
      if (!focusables.length) return;
      if (event.shiftKey && document.activeElement === focusables[0]) {
        event.preventDefault();
        focusables[focusables.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === focusables[focusables.length - 1]) {
        event.preventDefault();
        focusables[0].focus();
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
    <div className="users-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div aria-labelledby="stock-modal-title" aria-modal="true" className="users-modal" ref={dialogRef} role="dialog" tabIndex={-1}>
        <header className={`users-modal-heading modal-heading-${variant}`}>
          <div><h2 id="stock-modal-title">{title}</h2><p>{description}</p></div>
          <button aria-label="Cerrar" className="users-icon-button" onClick={onClose} type="button"><X size={17} /></button>
        </header>
        {children}
      </div>
    </div>
  );
}
