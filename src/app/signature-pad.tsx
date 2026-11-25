"use client";

import { Eraser, LoaderCircle, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { SignaturePoint } from "@/lib/work-orders";

type Props = {
  title: string;
  description: string;
  signerName: string;
  step: number;
  initialStrokes?: SignaturePoint[][];
  saving?: boolean;
  onAccept: (strokes: SignaturePoint[][]) => void;
  onCancel: () => void;
  onBack?: () => void;
};

function drawStrokes(canvas: HTMLCanvasElement, strokes: SignaturePoint[][]) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const bounds = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(bounds.width * ratio));
  const height = Math.max(1, Math.round(bounds.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, bounds.width, bounds.height);
  context.strokeStyle = "#173d30";
  context.fillStyle = "#173d30";
  context.lineWidth = 2.4;
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const stroke of strokes) {
    if (!stroke.length) continue;
    if (stroke.length === 1) {
      context.beginPath();
      context.arc(stroke[0].x * bounds.width, stroke[0].y * bounds.height, 1.5, 0, Math.PI * 2);
      context.fill();
      continue;
    }
    context.beginPath();
    context.moveTo(stroke[0].x * bounds.width, stroke[0].y * bounds.height);
    for (const point of stroke.slice(1)) context.lineTo(point.x * bounds.width, point.y * bounds.height);
    context.stroke();
  }
}

export default function SignaturePad({
  title,
  description,
  signerName,
  step,
  initialStrokes = [],
  saving = false,
  onAccept,
  onCancel,
  onBack,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentStrokeRef = useRef<SignaturePoint[] | null>(null);
  const strokesRef = useRef<SignaturePoint[][]>(initialStrokes);
  const [strokes, setStrokes] = useState(initialStrokes);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const redraw = () => drawStrokes(canvas, strokesRef.current);
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    redraw();
    return () => observer.disconnect();
  }, []);

  const updateStrokes = useCallback((next: SignaturePoint[][]) => {
    strokesRef.current = next;
    setStrokes(next);
    if (canvasRef.current) drawStrokes(canvasRef.current, next);
  }, []);

  function getPoint(event: PointerEvent<HTMLCanvasElement>): SignaturePoint {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
    };
  }

  function startStroke(event: PointerEvent<HTMLCanvasElement>) {
    if (saving || strokesRef.current.length >= 20) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    currentStrokeRef.current = [getPoint(event)];
  }

  function continueStroke(event: PointerEvent<HTMLCanvasElement>) {
    const stroke = currentStrokeRef.current;
    const totalPoints = strokesRef.current.reduce((total, item) => total + item.length, 0) + (stroke?.length ?? 0);
    if (!stroke || stroke.length >= 250 || totalPoints >= 2000) return;
    event.preventDefault();
    const point = getPoint(event);
    const previous = stroke[stroke.length - 1];
    if (Math.hypot(point.x - previous.x, point.y - previous.y) < 0.001) return;
    stroke.push(point);
    const next = [...strokesRef.current, [...stroke]];
    if (canvasRef.current) drawStrokes(canvasRef.current, next);
  }

  function finishStroke(event: PointerEvent<HTMLCanvasElement>) {
    const stroke = currentStrokeRef.current;
    if (!stroke) return;
    const point = getPoint(event);
    const previous = stroke[stroke.length - 1];
    const totalPoints = strokesRef.current.reduce((total, item) => total + item.length, 0) + stroke.length;
    if (stroke.length < 250 && totalPoints < 2000 && Math.hypot(point.x - previous.x, point.y - previous.y) >= 0.001) stroke.push(point);
    currentStrokeRef.current = null;
    updateStrokes([...strokesRef.current, stroke]);
  }

  function clearSignature() {
    currentStrokeRef.current = null;
    updateStrokes([]);
  }

  return (
    <div className="users-modal-backdrop signature-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onCancel(); }}>
      <section aria-labelledby="signature-modal-title" aria-modal="true" className="users-modal signature-modal" role="dialog">
        <header className="users-modal-heading modal-heading-info">
          <div>
            <span className="eyebrow">FIRMA {step} DE 2</span>
            <h2 id="signature-modal-title">{title}</h2>
            <p>{description}</p>
          </div>
          <button aria-label="Cancelar firma" className="users-icon-button" disabled={saving} onClick={onCancel} type="button"><X size={17} /></button>
        </header>
        <div className="signature-pad-content">
          <div className="signature-signer"><span>Firma correspondiente a</span><strong>{signerName}</strong></div>
          <canvas
            aria-label={`Área para dibujar la firma de ${signerName}`}
            className="signature-canvas"
            onPointerCancel={finishStroke}
            onPointerDown={startStroke}
            onPointerMove={continueStroke}
            onPointerUp={finishStroke}
            ref={canvasRef}
          />
          <p className="signature-hint">Firmá con el dedo, mouse o lápiz dentro del recuadro.</p>
          <div className="signature-modal-actions">
            {onBack
              ? <button className="users-cancel-button" disabled={saving} onClick={onBack} type="button">Volver a firma del cliente</button>
              : <button className="users-cancel-button" disabled={saving || strokes.length === 0} onClick={clearSignature} type="button"><Eraser size={14} /> Borrar</button>}
            <button className="users-save-button" disabled={saving || !strokes.some((stroke) => stroke.length >= 2)} onClick={() => onAccept(strokes)} type="button">
              {saving && <LoaderCircle aria-hidden="true" className="loading-spinner" size={14} />}
              {saving ? "Guardando..." : onBack ? "Confirmar firmas y completar" : "Aceptar y continuar"}
            </button>
          </div>
          {onBack && <button className="signature-clear-link" disabled={saving} onClick={clearSignature} type="button">Borrar firma del responsable</button>}
        </div>
      </section>
    </div>
  );
}
