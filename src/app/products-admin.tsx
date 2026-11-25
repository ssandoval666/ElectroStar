"use client";

import { FileUp, LoaderCircle, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";

type Product = {
  idproducto: string;
  descripcion: string;
  Valor: number;
  fecha_modificacion: string;
  usuario_modificacion: string;
};

type ProductForm = {
  descripcion: string;
  Valor: string;
};

type ProductReferences = {
  budgets: Array<{ id: string; descripcion: string; fecha: string }>;
  workOrders: Array<{ id: string; descripcion: string; fecha_programada: string; estado: string }>;
  stock: Array<{ idproducto: string; cantidad: number }>;
};

const emptyForm: ProductForm = { descripcion: "", Valor: "" };
const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});

export default function ProductsAdmin() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);
  const [productReferences, setProductReferences] = useState<ProductReferences | null>(null);
  const [checkingReferences, setCheckingReferences] = useState(false);
  const [importing, setImporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const importFileInput = useRef<HTMLInputElement>(null);
  const referenceRequestId = useRef(0);

  async function loadProducts() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/products");
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "No se pudieron cargar los productos.");
      setProducts(result.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los productos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/products")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message ?? "No se pudieron cargar los productos.");
        if (active) setProducts(result.items);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los productos.");
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

  function startEdit(product: Product) {
    setEditingId(product.idproducto);
    setForm({ descripcion: product.descripcion, Valor: String(product.Valor) });
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
    referenceRequestId.current += 1;
    setPendingDelete(null);
    setProductReferences(null);
    setCheckingReferences(false);
    setError("");
  }, [deleting]);

  async function openDeleteModal(product: Product) {
    const requestId = ++referenceRequestId.current;
    setPendingDelete(product);
    setProductReferences(null);
    setCheckingReferences(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/products/${product.idproducto}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "No se pudieron consultar las referencias.");
      if (requestId === referenceRequestId.current) setProductReferences(result.references);
    } catch (referenceError) {
      if (requestId === referenceRequestId.current) {
        setError(referenceError instanceof Error ? referenceError.message : "No se pudieron consultar las referencias.");
      }
    } finally {
      if (requestId === referenceRequestId.current) setCheckingReferences(false);
    }
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(editingId ? `/api/products/${editingId}` : "/api/products", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descripcion: form.descripcion, Valor: Number(form.Valor) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "No se pudo guardar el producto.");

      await loadProducts();
      closeForm();
      setNotice(editingId ? "Producto actualizado." : "Producto creado.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el producto.");
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
      const response = await fetch(`/api/products/${pendingDelete.idproducto}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) {
        if (result.references) setProductReferences(result.references);
        throw new Error(result.message ?? "No se pudo eliminar el producto.");
      }
      setProducts((current) => current.filter((product) => product.idproducto !== pendingDelete.idproducto));
      setPendingDelete(null);
      setProductReferences(null);
      setNotice("Producto eliminado.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el producto.");
    } finally {
      setDeleting(false);
    }
  }

  async function importProducts(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setImporting(true);
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/products/import", { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "No se pudo importar el archivo.");
      setNotice(result.message ?? "Productos importados.");
      await loadProducts();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "No se pudo importar el archivo.");
    } finally {
      setImporting(false);
    }
  }

  const filteredProducts = products.filter((product) =>
    product.descripcion.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );

  return (
    <section className="users-admin products-admin">
      <header className="users-admin-heading">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN DEL SISTEMA</span>
          <h1>Productos</h1>
          <p>Gestioná los productos y servicios disponibles.</p>
        </div>
        <div className="products-header-actions">
          <input accept="*/*" aria-label="Archivo para importar productos" className="visually-hidden" onChange={importProducts} ref={importFileInput} type="file" />
          <button className="users-import-button" disabled={importing} onClick={() => importFileInput.current?.click()} type="button">
            {importing ? <LoaderCircle aria-hidden="true" className="loading-spinner" size={16} /> : <FileUp size={16} />} {importing ? "Enviando archivo..." : "Importar productos"}
          </button>
          <button className="users-create-button" onClick={startCreate} type="button">
            <Plus size={16} /> Nuevo producto
          </button>
        </div>
      </header>

      {formOpen && (
        <ProductModal
          description="Completá la descripción y el valor del producto o servicio."
          onClose={closeForm}
          title={editingId ? "Editar producto" : "Nuevo producto"}
          variant={error ? "error" : "info"}
        >
          <form className="product-editor" onSubmit={submitForm}>
            <div className="product-editor-fields">
              <label>
                <span>Descripción</span>
                <input autoFocus maxLength={160} onChange={(event) => setForm((value) => ({ ...value, descripcion: event.target.value }))} required value={form.descripcion} />
              </label>
              <label>
                <span>Valor</span>
                <input min="0" onChange={(event) => setForm((value) => ({ ...value, Valor: event.target.value }))} required step="0.01" type="number" value={form.Valor} />
              </label>
            </div>
            {error && <p className="users-message users-message-error" role="alert">{error}</p>}
            <div className="user-editor-actions">
              <button className="users-cancel-button" disabled={saving} onClick={closeForm} type="button">Cancelar</button>
              <button className="users-save-button" disabled={saving} type="submit">{saving && <LoaderCircle aria-hidden="true" className="loading-spinner" size={14} />}{saving ? "Guardando..." : "Guardar producto"}</button>
            </div>
          </form>
        </ProductModal>
      )}

      {pendingDelete && (
        <ProductModal
          description="Antes de eliminarlo, verificamos que no esté utilizado."
          onClose={closeDeleteModal}
          title="Eliminar producto"
          variant={error || (productReferences && (productReferences.budgets.length > 0 || productReferences.workOrders.length > 0 || productReferences.stock.length > 0)) ? "error" : "warning"}
        >
          <div className="delete-confirmation">
            <p>¿Querés eliminar <strong>{pendingDelete.descripcion}</strong>?</p>
            {checkingReferences && <p className="product-reference-loading" role="status"><LoaderCircle aria-hidden="true" className="loading-spinner" size={14} /> Consultando referencias...</p>}
            {productReferences && (productReferences.budgets.length > 0 || productReferences.workOrders.length > 0 || productReferences.stock.length > 0) && <div className="product-references" role="status">
              <p>No se puede eliminar porque este producto tiene referencias:</p>
              {productReferences.budgets.length > 0 && <section><strong>Presupuestos ({productReferences.budgets.length})</strong><ul className="product-reference-list">{productReferences.budgets.map((budget) => <li key={budget.id}>{budget.descripcion} · {budget.fecha}</li>)}</ul></section>}
              {productReferences.workOrders.length > 0 && <section><strong>Órdenes de trabajo ({productReferences.workOrders.length})</strong><ul className="product-reference-list">{productReferences.workOrders.map((workOrder) => <li key={workOrder.id}>{workOrder.descripcion}{workOrder.fecha_programada ? ` · ${workOrder.fecha_programada}` : ""}</li>)}</ul></section>}
              {productReferences.stock.length > 0 && <section><strong>Inventario ({productReferences.stock.length})</strong><ul className="product-reference-list">{productReferences.stock.map((item) => <li key={item.idproducto}>{item.cantidad} disponibles</li>)}</ul></section>}
            </div>}
            {error && <p className="users-message users-message-error" role="alert">{error}</p>}
            <div className="user-editor-actions">
              <button className="users-cancel-button" disabled={deleting} onClick={closeDeleteModal} type="button">Cancelar</button>
              <button className="users-confirm-delete" disabled={deleting || checkingReferences || !productReferences || productReferences.budgets.length > 0 || productReferences.workOrders.length > 0 || productReferences.stock.length > 0 || Boolean(error)} onClick={() => void confirmDelete()} type="button">{deleting && <LoaderCircle aria-hidden="true" className="loading-spinner" size={14} />}{deleting ? "Eliminando..." : "Eliminar producto"}</button>
            </div>
          </div>
        </ProductModal>
      )}

      {notice && <p className="users-message users-message-success" role="status">{notice}</p>}
      {!formOpen && error && <p className="users-message users-message-error" role="alert">{error}</p>}

      <div className="users-table-toolbar">
        <label className="users-search">
          <Search size={16} />
          <input onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto" value={query} />
        </label>
        <span>{products.length} {products.length === 1 ? "producto" : "productos"}</span>
      </div>

      <div aria-busy={loading} className="users-table-scroll">
        <table className="users-table products-table">
          <thead><tr><th>Descripción</th><th>Valor</th><th><span className="visually-hidden">Acciones</span></th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td className="users-empty" colSpan={3}><span className="table-loading" role="status"><LoaderCircle aria-hidden="true" className="loading-spinner" size={17} /> Cargando productos...</span></td></tr>
            ) : filteredProducts.length ? filteredProducts.map((product) => (
              <tr key={product.idproducto}>
                <td><strong className="product-description">{product.descripcion}</strong></td>
                <td className="product-value">{currencyFormatter.format(product.Valor)}</td>
                <td><div className="users-row-actions">
                  <button aria-label={`Editar ${product.descripcion}`} className="users-icon-button" onClick={() => startEdit(product)} title="Editar producto" type="button"><Pencil size={15} /></button>
                  <button aria-label={`Eliminar ${product.descripcion}`} className="users-icon-button users-delete-button" onClick={() => void openDeleteModal(product)} title="Eliminar producto" type="button"><Trash2 size={15} /></button>
                </div></td>
              </tr>
            )) : (
              <tr><td className="users-empty" colSpan={3}>{query ? "No hay productos que coincidan con la búsqueda." : "Todavía no hay productos."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProductModal({
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
    const selector = "button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])";
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
      <div aria-labelledby="products-modal-title" aria-modal="true" className="users-modal" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } }} ref={dialogRef} role="dialog" tabIndex={-1}>
        <header className={`users-modal-heading modal-heading-${variant}`}>
          <div><h2 id="products-modal-title">{title}</h2><p>{description}</p></div>
          <button aria-label="Cerrar modal" className="users-icon-button" onClick={onClose} type="button"><X size={17} /></button>
        </header>
        {children}
      </div>
    </div>
  );
}