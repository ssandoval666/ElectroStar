export type CalendarEntry = {
  id: string;
  fecha: string;
  hora: string;
  descripcion: string;
  duracion: number;
  usuario_creacion: string;
};

export type CalendarEntryInput = Omit<CalendarEntry, "id" | "usuario_creacion">;