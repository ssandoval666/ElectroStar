import PDFDocument from "pdfkit";
import { getAdminSessionUser } from "@/lib/session";
import { readJsonEntity } from "@/lib/drive-json-store";
import type { BudgetRecord, ClientRecord } from "@/lib/budgets";

type RouteContext = { params: Promise<{ idpresupuesto: string }> };

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
const dateFormatter = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });

export async function GET(_request: Request, { params }: RouteContext) {
  const admin = await getAdminSessionUser();
  if (!admin) return Response.json({ message: "No autorizado." }, { status: 403 });

  try {
    const { idpresupuesto } = await params;
    const budgets = await readJsonEntity<BudgetRecord[]>("presupuestos.json", async () => []);
    const budget = budgets.find((item) => item.idpresupuesto === idpresupuesto);
    if (!budget) return Response.json({ message: "Presupuesto no encontrado." }, { status: 404 });

    const clients = await readJsonEntity<ClientRecord[]>("clientes.json", async () => []);
    const client = clients.find((item) => item.idclientes === budget.idclientes);
    if (!client) return Response.json({ message: "No se encontró el cliente del presupuesto." }, { status: 404 });

    const pdf = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Presupuesto ${budget.idpresupuesto}`, Author: "ElectroStar", Subject: budget.descripcion } });
    const pdfBuffer = new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
      pdf.on("end", () => resolve(Buffer.concat(chunks)));
      pdf.on("error", reject);
    });

    const pageWidth = pdf.page.width;
    const pageHeight = pdf.page.height;
    const margin = 48;
    const contentWidth = pageWidth - margin * 2;
    const tableColumns = [30, 224, 56, 90, 99];
    const tableHeaders = ["N°", "PRODUCTO / SERVICIO", "CANT.", "VALOR UNITARIO", "SUBTOTAL"];
    const formatDate = dateFormatter.format(new Date(`${budget.fecha}T00:00:00.000Z`));
    const shortId = budget.idpresupuesto.slice(0, 8).toUpperCase();

    function drawTableHeader(y: number) {
      pdf.roundedRect(margin, y, contentWidth, 30, 3).fill(colors.deepGreen);
      let x = margin;
      tableHeaders.forEach((label, index) => {
        pdf.font("Helvetica-Bold").fontSize(8).fillColor(colors.white)
          .text(label, x + 7, y + 10, { width: tableColumns[index] - 14, align: index > 1 ? "right" : "left", lineBreak: false });
        x += tableColumns[index];
      });
      return y + 30;
    }

    function drawContinuationHeader() {
      pdf.roundedRect(margin, 42, contentWidth, 42, 4).fill(colors.deepGreen);
      pdf.font("Helvetica-Bold").fontSize(11).fillColor(colors.white).text("ELECTROSTAR", margin + 14, 54);
      pdf.font("Helvetica").fontSize(9).fillColor("#DCE9D6").text(`Presupuesto N° ${shortId}`, margin + contentWidth - 180, 56, { width: 166, align: "right" });
      return drawTableHeader(100);
    }

    pdf.roundedRect(margin, 48, contentWidth, 100, 6).fill(colors.deepGreen);
    pdf.rect(margin, 48, 7, 100).fill(colors.lime);
    pdf.font("Helvetica-Bold").fontSize(20).fillColor(colors.white).text("ELECTROSTAR", margin + 22, 68);
    pdf.font("Helvetica").fontSize(9).fillColor("#DCE9D6").text("ENERGÍA QUE NOS UNE", margin + 23, 96);
    pdf.font("Helvetica-Bold").fontSize(13).fillColor(colors.lime).text("PRESUPUESTO", margin + 300, 70, { width: contentWidth - 322, align: "right" });
    pdf.font("Helvetica").fontSize(9).fillColor(colors.white).text(`N° ${shortId}  ·  ${formatDate}`, margin + 250, 96, { width: contentWidth - 272, align: "right" });

    let y = 170;
    pdf.font("Helvetica-Bold").fontSize(8).fillColor(colors.muted).text("DESCRIPCIÓN", margin, y);
    y += 14;
    pdf.font("Helvetica").fontSize(11).fillColor(colors.ink).text(budget.descripcion, margin, y, { width: contentWidth, lineGap: 2 });
    y = pdf.y + 17;

    const clientCardHeight = 76;
    pdf.roundedRect(margin, y, contentWidth, clientCardHeight, 4).fill(colors.light).stroke(colors.line);
    pdf.font("Helvetica-Bold").fontSize(8).fillColor(colors.green).text("CLIENTE", margin + 14, y + 13);
    pdf.font("Helvetica-Bold").fontSize(11).fillColor(colors.ink).text(`${client.nombre} ${client.apellido}`, margin + 14, y + 30, { width: 210 });
    pdf.font("Helvetica").fontSize(9).fillColor(colors.muted).text(`Teléfono: ${client.telefono}`, margin + 14, y + 49, { width: 210 });
    const detailX = margin + 270;
    pdf.font("Helvetica-Bold").fontSize(8).fillColor(colors.green).text("FECHA DEL PRESUPUESTO", detailX, y + 13);
    pdf.font("Helvetica").fontSize(10).fillColor(colors.ink).text(formatDate, detailX, y + 31);
    y += clientCardHeight + 22;
    y = drawTableHeader(y);

    for (let index = 0; index < budget.productos.length; index += 1) {
      const product = budget.productos[index];
      const descriptionWidth = tableColumns[1] - 16;
      pdf.font("Helvetica").fontSize(9);
      const descriptionHeight = pdf.heightOfString(product.descripcion_producto, { width: descriptionWidth, lineGap: 2 });
      const rowHeight = Math.max(34, descriptionHeight + 16);
      if (y + rowHeight > pageHeight - 92) y = drawContinuationHeader();

      if (index % 2 === 1) pdf.rect(margin, y, contentWidth, rowHeight).fill(colors.light);
      pdf.moveTo(margin, y + rowHeight).lineTo(margin + contentWidth, y + rowHeight).lineWidth(0.5).stroke(colors.line);
      let x = margin;
      const rowValues = [
        String(index + 1),
        product.descripcion_producto,
        new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(product.cantidad),
        currencyFormatter.format(product.valor_unitario),
        currencyFormatter.format(product.valor_total),
      ];
      rowValues.forEach((value, columnIndex) => {
        pdf.font(columnIndex === 4 ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(columnIndex === 4 ? colors.ink : "#46584C")
          .text(value, x + 7, y + 10, { width: tableColumns[columnIndex] - 14, align: columnIndex > 1 ? "right" : "left", lineGap: 2 });
        x += tableColumns[columnIndex];
      });
      y += rowHeight;
    }

    y += 15;
    if (y + 60 > pageHeight - 70) {
      pdf.addPage();
      y = 60;
    }
    pdf.roundedRect(margin + contentWidth - 225, y, 225, 58, 4).fill(colors.light).stroke(colors.line);
    pdf.font("Helvetica-Bold").fontSize(9).fillColor(colors.muted).text("TOTAL DEL PRESUPUESTO", margin + contentWidth - 211, y + 13, { width: 197 });
    pdf.font("Helvetica-Bold").fontSize(17).fillColor(colors.deepGreen).text(currencyFormatter.format(budget.total), margin + contentWidth - 211, y + 30, { width: 197 });
    pdf.font("Helvetica").fontSize(8).fillColor(colors.muted).text("Gracias por confiar en ElectroStar.", margin, pageHeight - 47, { width: contentWidth, align: "center" });

    pdf.end();
    const buffer = await pdfBuffer;
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="presupuesto-${budget.idpresupuesto}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Budget export error:", error);
    return Response.json({ message: "No se pudo exportar el presupuesto." }, { status: 503 });
  }
}