import PDFDocument from "pdfkit";
import { getCurrentSessionUser } from "@/lib/session";
import { readJsonEntity } from "@/lib/drive-json-store";
import { formatCuitCuil, type ClientRecord } from "@/lib/budgets";
import type { SignaturePoint, WorkOrder } from "@/lib/work-orders";

type RouteContext = { params: Promise<{ id: string }> };

const colors = {
  deepGreen: "#173D30",
  green: "#47734C",
  ink: "#25372D",
  muted: "#748278",
  line: "#E3E9E1",
  light: "#F5F8F3",
  lime: "#C7EF69",
  white: "#FFFFFF",
};
const currencyFormatter = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const quantityFormatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });

function getWarrantyMonths() {
  const rawValue = process.env.SERVICE_WARRANTY_MONTHS;
  if (!rawValue || !/^[1-9]\d*$/.test(rawValue)) {
    throw new Error("SERVICE_WARRANTY_MONTHS debe configurarse como un número entero positivo.");
  }
  const months = Number(rawValue);
  if (!Number.isSafeInteger(months)) {
    throw new Error("SERVICE_WARRANTY_MONTHS excede el valor permitido.");
  }
  return months;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getCurrentSessionUser();
  if (!user) return Response.json({ message: "Sesión no válida." }, { status: 401 });

  try {
    const { id } = await params;
    const [orders, clients] = await Promise.all([
      readJsonEntity<WorkOrder[]>("ordenes-trabajo.json", async () => []),
      readJsonEntity<ClientRecord[]>("clientes.json", async () => []),
    ]);
    const workOrder = orders.find((item) => item.id === id);
    if (!workOrder) return Response.json({ message: "La orden de trabajo no existe." }, { status: 404 });
    if (workOrder.estado !== "completada") {
      return Response.json({ message: "La factura solo está disponible para órdenes completadas." }, { status: 409 });
    }
    if (user.perfil !== "Admin" && workOrder.usuario_asignado !== user.idusuario) {
      return Response.json({ message: "Solo podés descargar facturas de órdenes asignadas a tu usuario." }, { status: 403 });
    }

    const client = clients.find((item) => item.idclientes === workOrder.idclientes);
    if (!client) return Response.json({ message: "No se encontró el cliente de la orden." }, { status: 404 });
    const warrantyMonths = getWarrantyMonths();

    const lines = [
      ...workOrder.materiales.map((item) => ({
        descripcion: item.descripcion_producto,
        cantidad: item.cantidad,
        valorUnitario: item.valor_unitario,
        valorTotal: item.valor_total,
      })),
      ...(workOrder.servicios ?? []).map((item) => ({
        descripcion: `${item.descripcion_servicio} (${item.unidad_servicio})`,
        cantidad: item.cantidad,
        valorUnitario: item.valor_unitario,
        valorTotal: item.valor_total,
      })),
    ];
    const total = lines.reduce((sum, item) => sum + item.valorTotal, 0);
    const pdf = new PDFDocument({
      size: "A4",
      margin: 48,
      info: {
        Title: `Factura de servicio ${workOrder.id}`,
        Author: "Con100ciaElectrica",
        Subject: workOrder.descripcion,
      },
    });
    const pdfBuffer = new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
      pdf.on("end", () => resolve(Buffer.concat(chunks)));
      pdf.on("error", reject);
    });

    const margin = 48;
    const contentWidth = pdf.page.width - margin * 2;
    const pageHeight = pdf.page.height;
    const tableColumns = [28, 180, 52, 112, 127];
    const tableHeaders = ["N°", "PRODUCTO / SERVICIO", "CANT.", "VALOR UNITARIO", "SUBTOTAL"];
    const shortId = workOrder.id.slice(0, 8).toUpperCase();
    const date = new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(workOrder.fecha_modificacion));

    function drawTableHeader(y: number) {
      pdf.roundedRect(margin, y, contentWidth, 30, 3).fill(colors.deepGreen);
      let x = margin;
      tableHeaders.forEach((label, index) => {
        pdf.font("Helvetica-Bold").fontSize(7).fillColor(colors.white)
          .text(label, x + 5, y + 10, { width: tableColumns[index] - 10, align: index > 1 ? "right" : "left", lineBreak: false });
        x += tableColumns[index];
      });
      return y + 30;
    }

    function drawContinuationHeader() {
      pdf.roundedRect(margin, 42, contentWidth, 42, 4).fill(colors.deepGreen);
      pdf.font("Helvetica-Bold").fontSize(11).fillColor(colors.white)
        .text("CON100CIAELECTRICA", margin + 14, 54);
      pdf.font("Helvetica").fontSize(9).fillColor("#DCE9D6")
        .text(`Factura de servicio N° ${shortId}`, margin + contentWidth - 205, 56, { width: 191, align: "right" });
      return drawTableHeader(100);
    }

    pdf.roundedRect(margin, 48, contentWidth, 88, 6).fill(colors.deepGreen);
    pdf.rect(margin, 48, 7, 88).fill(colors.lime);
    pdf.font("Helvetica-Bold").fontSize(19).fillColor(colors.white)
      .text("CON100CIAELECTRICA", margin + 22, 65);
    pdf.font("Helvetica").fontSize(9).fillColor("#DCE9D6")
      .text("CONSTANCIA DE SERVICIO REALIZADO", margin + 23, 94);
    pdf.font("Helvetica-Bold").fontSize(11).fillColor(colors.lime)
      .text("FACTURA", margin + 300, 68, { width: contentWidth - 322, align: "right" });
    pdf.font("Helvetica").fontSize(8).fillColor(colors.white)
      .text(`N° ${shortId} · ${date}`, margin + 245, 96, { width: contentWidth - 267, align: "right" });

    let y = 154;
    pdf.font("Helvetica-Bold").fontSize(8).fillColor(colors.muted).text("TRABAJO REALIZADO", margin, y);
    y += 14;
    pdf.font("Helvetica").fontSize(10).fillColor(colors.ink)
      .text(workOrder.tareas || workOrder.descripcion, margin, y, { width: contentWidth, lineGap: 2 });
    y = pdf.y + 14;

    const clientFields = [
      `Nombre y apellido: ${client.nombre} ${client.apellido}`,
      `Dirección: ${client.direccion?.trim() || "No informada"}`,
      `Teléfono: ${client.telefono}`,
      `CUIT/CUIL: ${client.cuit_cuil ? formatCuitCuil(client.cuit_cuil) : "No informado"}`,
    ];
    const clientCardHeight = clientFields.reduce((height, field) => {
      pdf.font("Helvetica").fontSize(9);
      return height + Math.max(13, pdf.heightOfString(field, { width: contentWidth - 32 }));
    }, 49);
    pdf.roundedRect(margin, y, contentWidth, clientCardHeight, 4).fill(colors.light).stroke(colors.line);
    pdf.font("Helvetica-Bold").fontSize(8).fillColor(colors.green).text("DATOS DEL CLIENTE", margin + 14, y + 12);
    let clientY = y + 29;
    for (const field of clientFields) {
      pdf.font("Helvetica").fontSize(9).fillColor(colors.ink)
        .text(field, margin + 14, clientY, { width: contentWidth - 28, lineGap: 2 });
      clientY = pdf.y + 2;
    }
    y += clientCardHeight + 18;
    y = drawTableHeader(y);

    if (!lines.length) {
      pdf.font("Helvetica").fontSize(9).fillColor(colors.muted)
        .text("La orden no tiene productos ni servicios detallados.", margin + 8, y + 13, { width: contentWidth - 16 });
      y += 42;
    }

    for (let index = 0; index < lines.length; index += 1) {
      const item = lines[index];
      const descriptionWidth = tableColumns[1] - 12;
      pdf.font("Helvetica").fontSize(8);
      const descriptionHeight = pdf.heightOfString(item.descripcion, { width: descriptionWidth, lineGap: 2 });
      const rowHeight = Math.max(34, descriptionHeight + 16);
      if (y + rowHeight > pageHeight - 92) y = drawContinuationHeader();

      if (index % 2 === 1) pdf.rect(margin, y, contentWidth, rowHeight).fill(colors.light);
      pdf.moveTo(margin, y + rowHeight).lineTo(margin + contentWidth, y + rowHeight).lineWidth(0.5).stroke(colors.line);
      let x = margin;
      const values = [
        String(index + 1),
        item.descripcion,
        quantityFormatter.format(item.cantidad),
        currencyFormatter.format(item.valorUnitario),
        currencyFormatter.format(item.valorTotal),
      ];
      values.forEach((value, columnIndex) => {
        pdf.font(columnIndex === 4 ? "Helvetica-Bold" : "Helvetica").fontSize(8)
          .fillColor(columnIndex === 4 ? colors.ink : "#46584C")
          .text(value, x + 5, y + 9, { width: tableColumns[columnIndex] - 10, align: columnIndex > 1 ? "right" : "left", lineGap: 2 });
        x += tableColumns[columnIndex];
      });
      y += rowHeight;
    }

    y += 16;
    if (y + 140 > pageHeight - 56) {
      pdf.addPage();
      y = 56;
    }
    pdf.roundedRect(margin + contentWidth - 225, y, 225, 58, 4).fill(colors.light).stroke(colors.line);
    pdf.font("Helvetica-Bold").fontSize(9).fillColor(colors.muted)
      .text("TOTAL DEL SERVICIO", margin + contentWidth - 211, y + 13, { width: 197 });
    pdf.font("Helvetica-Bold").fontSize(17).fillColor(colors.deepGreen)
      .text(currencyFormatter.format(total), margin + contentWidth - 211, y + 30, { width: 197 });
    y += 78;

    const warrantyText = `A través de este formulario se deja constancia del trabajo realizado con consentimiento y satisfacción del cliente.\nAplicándose una garantía de ${warrantyMonths} ${warrantyMonths === 1 ? "mes" : "meses"}.`;
    const warrantyHeight = pdf.heightOfString(warrantyText, { width: contentWidth - 28, lineGap: 4 });
    pdf.roundedRect(margin, y, contentWidth, warrantyHeight + 28, 4).fill(colors.light).stroke(colors.line);
    pdf.font("Helvetica").fontSize(9).fillColor(colors.ink)
      .text(warrantyText, margin + 14, y + 14, { width: contentWidth - 28, lineGap: 4 });
    y += warrantyHeight + 50;

    const signatureBlockHeight = 96;
    if (y + signatureBlockHeight > pageHeight - 50) {
      pdf.addPage();
      y = 72;
    }
    const signatureWidth = (contentWidth - 24) / 2;
    const signatureColumns = [
      { title: "Firma del cliente", signature: workOrder.signatures?.client, x: margin },
      { title: "Firma del responsable", signature: workOrder.signatures?.responsible, x: margin + signatureWidth + 24 },
    ];
    for (const column of signatureColumns) {
      pdf.roundedRect(column.x, y, signatureWidth, signatureBlockHeight, 4).fill(colors.light).stroke(colors.line);
      if (column.signature) {
        drawSignature(pdf, column.signature.strokes, column.x + 14, y + 8, signatureWidth - 28, 48);
      }
      pdf.moveTo(column.x + 14, y + 59).lineTo(column.x + signatureWidth - 14, y + 59).lineWidth(0.7).stroke(colors.muted);
      pdf.font("Helvetica-Bold").fontSize(8).fillColor(colors.ink)
        .text(column.title, column.x + 12, y + 64, { width: signatureWidth - 24, align: "center", lineBreak: false });
      if (column.signature) {
        pdf.font("Helvetica").fontSize(7).fillColor(colors.muted)
          .text(column.signature.signedBy, column.x + 12, y + 77, { width: signatureWidth - 24, align: "center", lineBreak: false });
      }
    }

    pdf.end();
    const buffer = await pdfBuffer;
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="factura-orden-${workOrder.id.replace(/[^a-zA-Z0-9-]/g, "")}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Work order invoice export error:", error);
    return Response.json({ message: "No se pudo generar la factura. Verificá la configuración SERVICE_WARRANTY_MONTHS." }, { status: 503 });
  }

  function drawSignature(
    pdf: PDFKit.PDFDocument,
    strokes: SignaturePoint[][],
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    pdf.save();
    pdf.strokeColor(colors.deepGreen).lineWidth(1.7).lineCap("round").lineJoin("round");
    for (const stroke of strokes) {
      if (stroke.length < 2) continue;
      const [first, ...rest] = stroke;
      pdf.moveTo(x + first.x * width, y + first.y * height);
      for (const point of rest) pdf.lineTo(x + point.x * width, y + point.y * height);
      pdf.stroke();
    }
    pdf.restore();
  }
}
