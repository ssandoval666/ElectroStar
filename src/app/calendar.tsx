"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Clock3, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import type { CalendarEntry } from "@/lib/calendar";

const monthFormatter = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" });
const weekdayFormatter = new Intl.DateTimeFormat("es-AR", { weekday: "short" });
const longDateFormatter = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const hours = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`);

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatLongDate(value: string) {
  return longDateFormatter.format(new Date(`${value}T12:00:00`));
}

export default function Calendar() {
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<CalendarEntry | null>(null);
  const [selectedHour, setSelectedHour] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("60");
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState(false);
  const [error, setError] = useState("");

  async function loadEntries() {
    setLoading(true);
    try {
      const response = await fetch("/api/calendar");
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "No se pudo cargar la agenda.");
      setEntries(result.items);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la agenda.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/calendar")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message ?? "No se pudo cargar la agenda.");
        return result as { items: CalendarEntry[] };
      })
      .then((result) => { if (active) setEntries(result.items); })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la agenda.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedDate && selectedHour === null && !editingEntry && !deleteConfirmation) return;

    function handleModalKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (deleteConfirmation) {
        if (!saving) setDeleteConfirmation(false);
      } else if (editingEntry || selectedHour !== null) {
        if (!saving) {
          setSelectedHour(null);
          setEditingEntry(null);
        }
      } else {
        setSelectedDate(null);
      }
    }

    window.addEventListener("keydown", handleModalKeyDown);
    return () => window.removeEventListener("keydown", handleModalKeyDown);
  }, [deleteConfirmation, editingEntry, saving, selectedDate, selectedHour]);

  const calendarDays = useMemo(() => {
    const firstOfMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
    const start = new Date(firstOfMonth);
    start.setDate(start.getDate() - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [visibleMonth]);

  const entriesByDate = useMemo(() => {
    const grouped = new Map<string, CalendarEntry[]>();
    entries.forEach((entry) => grouped.set(entry.fecha, [...(grouped.get(entry.fecha) ?? []), entry]));
    grouped.forEach((dayEntries) => dayEntries.sort((left, right) => left.hora.localeCompare(right.hora)));
    return grouped;
  }, [entries]);

  function openNewEntry(date: string, hour: string) {
    setEditingEntry(null);
    setSelectedHour(hour);
    setFormDate(date);
    setFormTime(hour);
    setDescription("");
    setDuration("60");
    setError("");
  }

  function openExistingEntry(entry: CalendarEntry) {
    setEditingEntry(entry);
    setSelectedHour(null);
    setFormDate(entry.fecha);
    setFormTime(entry.hora);
    setDescription(entry.descripcion);
    setDuration(String(entry.duracion));
    setError("");
  }

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(editingEntry ? `/api/calendar/${editingEntry.id}` : "/api/calendar", {
        method: editingEntry ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha: formDate, hora: formTime, descripcion: description, duracion: Number(duration) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "No se pudo guardar la actividad.");
      await loadEntries();
      setSelectedDate(formDate);
      setSelectedHour(null);
      setEditingEntry(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar la actividad.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry() {
    if (!editingEntry) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/calendar/${editingEntry.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "No se pudo eliminar la actividad.");
      await loadEntries();
      setDeleteConfirmation(false);
      setEditingEntry(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar la actividad.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="calendar-page" aria-label="Agenda mensual">
      <header className="calendar-heading">
        <div>
          <span className="eyebrow">ORGANIZÁ TU TIEMPO</span>
          <h1>Agenda</h1>
          <p>Actividades y tareas programadas.</p>
        </div>
        <button className="calendar-today-button" onClick={() => setVisibleMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} type="button">Hoy</button>
      </header>

      <div className="calendar-toolbar">
        <div className="calendar-month-controls">
          <button aria-label="Mes anterior" className="calendar-icon-button" onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))} type="button"><ChevronLeft size={18} /></button>
          <h2>{monthFormatter.format(visibleMonth)}</h2>
          <button aria-label="Mes siguiente" className="calendar-icon-button" onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))} type="button"><ChevronRight size={18} /></button>
        </div>
        <span className="calendar-key"><i /> Actividad programada</span>
      </div>

      {error && !selectedDate && !editingEntry && <p className="calendar-message calendar-message-error" role="alert">{error}</p>}
      <div aria-busy={loading} className="calendar-grid" role="grid" aria-label={monthFormatter.format(visibleMonth)}>
        {Array.from({ length: 7 }, (_, index) => {
          const date = new Date(2024, 0, 1 + index);
          return <div className="calendar-weekday" key={index}>{weekdayFormatter.format(date).replace(".", "")}</div>;
        })}
        {calendarDays.map((date) => {
          const key = dateKey(date);
          const dayEntries = entriesByDate.get(key) ?? [];
          const inMonth = date.getMonth() === visibleMonth.getMonth();
          const isToday = key === dateKey(new Date());
          return (
            <button
              aria-label={`${formatLongDate(key)}${dayEntries.length ? `, ${dayEntries.length} actividades` : ""}`}
              aria-current={isToday ? "date" : undefined}
              className={`calendar-day ${inMonth ? "" : "calendar-day-muted"} ${isToday ? "calendar-day-today" : ""}`}
              key={key}
              onClick={() => setSelectedDate(key)}
              type="button"
            >
              <span className="calendar-day-number">{date.getDate()}</span>
              <span className="calendar-day-entries">
                {dayEntries.slice(0, 3).map((entry) => <span className="calendar-day-entry" key={entry.id}><time>{entry.hora}</time> {entry.descripcion}</span>)}
                {dayEntries.length > 3 && <span className="calendar-more">+{dayEntries.length - 3} más</span>}
              </span>
              {dayEntries.length > 0 && <span className="calendar-day-count">{dayEntries.length}</span>}
            </button>
          );
        })}
      </div>
      {loading && <p className="calendar-loading" role="status"><LoaderCircle aria-hidden="true" className="loading-spinner" size={16} /> Cargando actividades...</p>}

      {selectedDate && !editingEntry && selectedHour === null && (
        <div className="users-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedDate(null); }}>
          <section aria-labelledby="calendar-day-title" aria-modal="true" className="users-modal calendar-day-modal" role="dialog">
            <div className="users-modal-heading">
              <div><span className="eyebrow">AGENDA DEL DÍA</span><h2 id="calendar-day-title">{formatLongDate(selectedDate)}</h2><p>Elegí una actividad para editarla o una hora para crear una nueva.</p></div>
              <button aria-label="Cerrar" className="users-icon-button" onClick={() => setSelectedDate(null)} type="button"><X size={18} /></button>
            </div>
            <div className="calendar-day-content">
              {(entriesByDate.get(selectedDate) ?? []).length > 0 && <div className="calendar-existing-list">
                {(entriesByDate.get(selectedDate) ?? []).map((entry) => (
                  <button className="calendar-existing-entry" key={entry.id} onClick={() => openExistingEntry(entry)} type="button">
                    <span className="calendar-entry-time"><Clock3 size={14} />{entry.hora}</span>
                    <span className="calendar-entry-copy"><strong>{entry.descripcion}</strong><small>{entry.duracion} minutos</small></span>
                    <ChevronRight size={17} />
                  </button>
                ))}
              </div>}
              <h3>Seleccionar una hora</h3>
              <div className="calendar-hour-grid">
                {hours.map((hour) => {
                  const hourEntries = (entriesByDate.get(selectedDate) ?? []).filter((entry) => entry.hora.slice(0, 2) === hour.slice(0, 2));
                  return <button className={`calendar-hour ${hourEntries.length ? "calendar-hour-busy" : ""}`} key={hour} onClick={() => openNewEntry(selectedDate, hour)} type="button">{hour}{hourEntries.length > 0 && <span>{hourEntries.length}</span>}</button>;
                })}
              </div>
            </div>
          </section>
        </div>
      )}

      {(editingEntry || selectedHour !== null) && (
        <div className="users-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setSelectedHour(null); setEditingEntry(null); } }}>
          <section aria-labelledby="calendar-editor-title" aria-modal="true" className="users-modal calendar-editor-modal" role="dialog">
            <div className="users-modal-heading">
              <div><span className="eyebrow">{editingEntry ? "EDITAR ACTIVIDAD" : "NUEVA ACTIVIDAD"}</span><h2 id="calendar-editor-title">{editingEntry ? "Editar actividad" : "Programar actividad"}</h2><p>{formatLongDate(formDate)}</p></div>
              <button aria-label="Volver al día" className="users-icon-button" disabled={saving} onClick={() => { setSelectedHour(null); setEditingEntry(null); }} type="button"><X size={18} /></button>
            </div>
            <form className="calendar-editor" onSubmit={saveEntry}>
              <div className="calendar-editor-fields">
                <label>Descripción de la tarea<input autoFocus maxLength={240} onChange={(event) => setDescription(event.target.value)} placeholder="Ej. Revisar tablero eléctrico" required value={description} /></label>
                <div className="calendar-editor-row">
                  <label>Fecha<input onChange={(event) => setFormDate(event.target.value)} required type="date" value={formDate} /></label>
                  <label>Hora<input onChange={(event) => setFormTime(event.target.value)} required type="time" value={formTime} /></label>
                </div>
                <label>Duración (minutos)<input min="1" max="1440" onChange={(event) => setDuration(event.target.value)} required step="1" type="number" value={duration} /></label>
              </div>
              {error && !deleteConfirmation && <p className="calendar-message calendar-message-error" role="alert">{error}</p>}
              <div className="calendar-editor-actions">
                {editingEntry && <button className="calendar-delete-button" disabled={saving} onClick={() => { setError(""); setDeleteConfirmation(true); }} type="button"><Trash2 size={15} />Eliminar</button>}
                <span />
                <button className="users-cancel-button" disabled={saving} onClick={() => { setSelectedHour(null); setEditingEntry(null); }} type="button">Cancelar</button>
                <button className="users-save-button" disabled={saving} type="submit">{saving ? <LoaderCircle aria-hidden="true" className="loading-spinner" size={15} /> : <Plus size={15} />}{saving ? "Guardando..." : editingEntry ? "Guardar" : "Crear actividad"}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {deleteConfirmation && editingEntry && (
        <div className="users-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setDeleteConfirmation(false); }}>
          <section aria-labelledby="calendar-delete-title" aria-modal="true" className="users-modal calendar-delete-modal" role="alertdialog">
            <div className="users-modal-heading">
              <div><span className="eyebrow">CONFIRMAR ELIMINACIÓN</span><h2 id="calendar-delete-title">¿Eliminar esta actividad?</h2></div>
              <button aria-label="Cerrar confirmación" className="users-icon-button" disabled={saving} onClick={() => setDeleteConfirmation(false)} type="button"><X size={18} /></button>
            </div>
            <div className="delete-confirmation">
              <p>Se eliminará <strong>{editingEntry.descripcion}</strong> del {formatLongDate(editingEntry.fecha)} a las {editingEntry.hora}. Esta acción no se puede deshacer.</p>
              {error && <p className="calendar-message calendar-message-error" role="alert">{error}</p>}
              <div className="user-editor-actions">
                <button className="users-cancel-button" disabled={saving} onClick={() => setDeleteConfirmation(false)} type="button">Cancelar</button>
                <button className="users-confirm-delete" disabled={saving} onClick={deleteEntry} type="button">{saving && <LoaderCircle aria-hidden="true" className="loading-spinner" size={14} />}{saving ? "Eliminando..." : "Eliminar actividad"}</button>
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}