import { createHash } from "node:crypto";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import * as pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";
import { normalizeServiceName } from "@/lib/services";

const pdfjsGlobal = globalThis as typeof globalThis & { pdfjsWorker?: typeof pdfWorker };
pdfjsGlobal.pdfjsWorker ??= pdfWorker;

export const defaultAAIERICUrl = "https://aaieric.org.ar/costos-mano-de-obra";
const MAX_PDF_BYTES = 12 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const MAX_PDF_PAGES = 20;

export type ExtractedAAIERICPrice = {
  clave: string;
  descripcion: string;
  categoria: string;
  unidad: string;
  Valor: number;
  pagina: number;
};

function isAllowedAAIERICUrl(url: URL) {
  return url.protocol === "https:" && (url.hostname === "aaieric.org.ar" || url.hostname === "www.aaieric.org.ar");
}

export async function fetchAAIERICPdf() {
  const sourceUrl = process.env.AAIERIC_SERVICES_PDF_URL ?? defaultAAIERICUrl;
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw new Error("AAIERIC_SERVICES_PDF_URL no contiene una URL válida.");
  }
  if (!isAllowedAAIERICUrl(url)) throw new Error("La fuente de costos debe pertenecer al sitio seguro de AAIERIC.");

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === MAX_REDIRECTS) throw new Error("La fuente AAIERIC excedió el límite de redirecciones.");
      url = new URL(location, url);
      if (!isAllowedAAIERICUrl(url)) throw new Error("La fuente AAIERIC redirigió fuera del dominio autorizado.");
      continue;
    }
    if (!response.ok) throw new Error(`La fuente AAIERIC respondió con estado ${response.status}.`);
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_PDF_BYTES) throw new Error("El PDF de AAIERIC supera el tamaño permitido.");
    if (!response.body) throw new Error("La respuesta de AAIERIC no contiene un archivo.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.length;
        if (totalBytes > MAX_PDF_BYTES) {
          await reader.cancel();
          throw new Error("El PDF de AAIERIC supera el tamaño permitido.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes);
    if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error("La respuesta de AAIERIC no es un PDF válido o supera el tamaño permitido.");
    }
    return {
      buffer,
      hash: createHash("sha256").update(buffer).digest("hex"),
      url: url.toString(),
    };
  }
  throw new Error("No se pudo obtener el PDF de AAIERIC.");
}

function parseAmount(value: string): number | null {
  const normalized = value.replace(/AR\$|\$/gi, "").replace(/\s/g, "");
  let numeric = normalized;
  if (normalized.includes(",") && normalized.includes(".")) {
    numeric = normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, "");
  } else if (/[.,]/.test(normalized)) {
    const separator = normalized.includes(",") ? "," : ".";
    const digitsAfterSeparator = normalized.length - normalized.lastIndexOf(separator) - 1;
    if (digitsAfterSeparator === 3 && /^\d{1,3}(?:[.,]\d{3})+$/.test(normalized)) {
      numeric = normalized.replace(/[.,]/g, "");
    } else if (digitsAfterSeparator <= 2 && /^\d+[.,]\d{1,2}$/.test(normalized)) {
      numeric = normalized.replace(",", ".");
    } else {
      return null;
    }
  }
  const amount = Number(numeric);
  return Number.isFinite(amount) && amount > 0 && amount <= 100_000_000
    ? Math.round(amount * 100) / 100
    : null;
}

function findAmounts(value: string) {
  const standaloneAmount = parseAmount(value);
  if (standaloneAmount !== null) return [{ amount: standaloneAmount, description: "" }];

  return [...value.matchAll(/(?:AR\$|\$)\s*(\d[\d.,]*)/gi)]
    .map((match) => ({
      amount: parseAmount(match[0]),
      description: value.slice(0, match.index).replace(/[\s$:=—-]+$/g, "").replace(/^\s*\$+\s*/, "").trim(),
    }))
    .filter((match): match is { amount: number; description: string } => match.amount !== null);
}

function inferUnit(description: string, explicitUnit?: string) {
  if (explicitUnit) return explicitUnit;
  if (/\b(boca|bocas)\b/i.test(description)) return "boca";
  if (/\bmetro|lineal\b/i.test(description)) return "metro";
  if (/accesorio/i.test(description)) return "accesorio";
  if (/\bm2\b|m²|metro cuadrado/i.test(description)) return "m2";
  if (/\bkva\b/i.test(description)) return "kVA";
  return "servicio";
}

type PositionedHeaderText = { x: number; y: number; text: string };
type PdfPageWithOperators = {
  getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
};

async function getBlueHeaderText(page: PdfPageWithOperators) {
  const operators = await page.getOperatorList();
  const headers: PositionedHeaderText[] = [];
  let fillColor = "";
  let x = 0;
  let y = 0;

  for (let index = 0; index < operators.fnArray.length; index += 1) {
    const operation = operators.fnArray[index];
    const args = operators.argsArray[index] ?? [];
    if (operation === OPS.setFillRGBColor) {
      if (typeof args[0] === "string") fillColor = args[0];
    } else if (operation === OPS.beginText) {
      x = 0;
      y = 0;
    } else if (operation === OPS.moveText) {
      if (typeof args[0] === "number" && typeof args[1] === "number") {
        x = args[0];
        y = args[1];
      }
    } else if (operation === OPS.setTextMatrix) {
      if (typeof args[4] === "number" && typeof args[5] === "number") {
        x = args[4];
        y = args[5];
      }
    } else if ((operation === OPS.showText || operation === OPS.showSpacedText) && fillColor.toLocaleLowerCase() === "#ffffff") {
      const glyphs = Array.isArray(args[0]) ? args[0] : [];
      const text = glyphs
        .map((glyph) => typeof glyph === "object" && glyph !== null && "unicode" in glyph && typeof glyph.unicode === "string" ? glyph.unicode : "")
        .join("")
        .trim();
      if (text) headers.push({ x: Math.round(x), y: Math.round(y), text });
    }
  }
  return headers;
}

function readDocumentDate(text: string): string | null {
  const months: Record<string, string> = {
    enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06",
    julio: "07", agosto: "08", septiembre: "09", setiembre: "09", octubre: "10",
    noviembre: "11", diciembre: "12",
  };
  const match = text.match(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(\d{4})\b/i);
  if (!match) return null;
  return `${match[2]}-${months[match[1].toLocaleLowerCase()]}`;
}

export async function extractAAIERICPrices(buffer: Buffer): Promise<{ items: ExtractedAAIERICPrice[]; fechaDocumento: string | null }> {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    verbosity: 0,
  });
  const document = await loadingTask.promise;
  if (document.numPages > MAX_PDF_PAGES) {
    await loadingTask.destroy();
    throw new Error("El PDF de AAIERIC supera la cantidad de páginas permitida.");
  }
  const items: ExtractedAAIERICPrice[] = [];
  let documentText = "";

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      if (content.items.length > 10_000) throw new Error("El PDF de AAIERIC contiene demasiados elementos de texto.");
      const blueHeaders = await getBlueHeaderText(page);
      const lines: Array<{ y: number; items: Array<{ x: number; text: string; height: number; fontName: string }> }> = [];
      for (const textItem of content.items) {
        if (!("str" in textItem) || !textItem.str.trim()) continue;
        const text = textItem.str.trim();
        const x = Math.round(textItem.transform[4]);
        const y = Math.round(textItem.transform[5]);
        documentText += `${text} `;
        let line = lines.find((candidate) => Math.abs(candidate.y - y) <= 2);
        if (!line) {
          line = { y, items: [] };
          lines.push(line);
        }
        line.items.push({ x, text, height: textItem.height, fontName: textItem.fontName });
      }

      const sortedLines = [...lines].sort((a, b) => b.y - a.y);
      const headerRows = blueHeaders.reduce<Array<{
        y: number;
        items: PositionedHeaderText[];
        columns: PositionedHeaderText[];
        groups: PositionedHeaderText[];
      }>>((rows, header) => {
        let row = rows.find((candidate) => Math.abs(candidate.y - header.y) <= 2);
        if (!row) {
          row = { y: header.y, items: [], columns: [], groups: [] };
          rows.push(row);
        }
        row.items.push(header);
        return rows;
      }, []).sort((a, b) => b.y - a.y);
      const amountLines = sortedLines.filter((line) =>
        line.items.some((item) => findAmounts(item.text).length > 0),
      );
      for (const row of headerRows) {
        const nextPricedLine = amountLines.find((candidate) => candidate.y < row.y);
        const priceColumns = nextPricedLine
          ? [...new Set(nextPricedLine.items
            .filter((item) => findAmounts(item.text).length > 0)
            .map((item) => item.x)
            .sort((a, b) => a - b)
            .filter((x, index, positions) => index === 0 || x - positions[index - 1] > 15))]
          : [];
        const matchedColumns = row.items.filter((header) =>
          !/^\$\s*x/i.test(header.text) &&
          priceColumns.some((x) => Math.abs(x - header.x) <= 16),
        );
        const matchedColumnCount = new Set(matchedColumns.map((header) =>
          [...priceColumns].sort((a, b) => Math.abs(a - header.x) - Math.abs(b - header.x))[0],
        )).size;
        row.columns = matchedColumnCount >= 2 ? matchedColumns : [];
        row.groups = row.items.filter((header) =>
          !/^\$\s*x/i.test(header.text) &&
          !row.columns.includes(header) &&
          header.text.length <= 120,
        );
      }

      const unitHeaders = blueHeaders
        .map((header) => ({ ...header, unit: header.text.match(/^\$\s*x\s*(.+)$/i)?.[1]?.trim() ?? "" }))
        .filter((header) => header.unit);

      for (const line of sortedLines) {
        const ordered = line.items.sort((a, b) => a.x - b.x);
        for (const sourceItem of ordered) {
          const amounts = findAmounts(sourceItem.text);
          for (const { amount, description: inlineDescription } of amounts) {
            if (sourceItem.x < 200 || line.y < 80 || line.y > 770) continue;

            const hasRightTableLabel = sourceItem.x > 400 && ordered.some((candidate) =>
              candidate.x >= 300 && candidate.x < sourceItem.x && /[\p{L}]/u.test(candidate.text) && !/^\$\s*x/i.test(candidate.text),
            );
            const descriptionItems = ordered.filter((candidate) =>
              candidate.x < sourceItem.x &&
              (sourceItem.x <= 300 ? candidate.x < 225 : !hasRightTableLabel || candidate.x >= 300) &&
              /[\p{L}]/u.test(candidate.text) &&
              !/^\$\s*x/i.test(candidate.text) &&
              !/^H\s*[<>]\s*\d+\s*m$/i.test(candidate.text),
            );
            const descriptionItem = descriptionItems.at(-1);
            const description = inlineDescription || descriptionItem?.text;
            if (!description || description.length < 3 || description.length > 160) continue;

            const descriptionX = descriptionItem?.x ?? sourceItem.x - 100;
            const relevantGroups = headerRows.flatMap((row) =>
              row.groups
                .filter((header) =>
                  header.y >= line.y &&
                  header.y - line.y <= 200 &&
                  header.x >= descriptionX - 50 &&
                  header.x <= sourceItem.x + 25,
                )
                .map((header) => {
                  const rowUnits = unitHeaders.filter((unitHeader) =>
                    Math.abs(unitHeader.y - row.y) <= 2 &&
                    Math.abs(unitHeader.x - header.x) <= 165,
                  );
                  const rowColumns = row.columns.filter((column) =>
                    Math.abs(column.x - header.x) <= 200,
                  );
                  const hasColumnGroup = row.columns.length >= 2 && rowColumns.length > 0;
                  const signature = rowUnits.length
                    ? `unit:${normalizeServiceName(rowUnits[0].unit)}`
                    : hasColumnGroup
                      ? `columns:${row.columns.map((column) => column.text.toLocaleLowerCase().replace(/\s+/g, "")).join("|")}`
                      : "";
                  return { ...header, signature, isSubgroup: Boolean(signature) };
                }),
            ).sort((a, b) => a.y - b.y);
            const latestRoot = relevantGroups.find((header) => !header.isSubgroup);
            const subgroupCandidates = relevantGroups.filter((header) =>
                header.isSubgroup && (!latestRoot || header.y < latestRoot.y),
            );
            const latestSubgroup = subgroupCandidates[0];
            const previousSameSubgroup = latestSubgroup
                ? subgroupCandidates.find((header) =>
                  header.y > latestSubgroup.y && header.signature === latestSubgroup.signature,
                )
                : undefined;
            const rootContinues = latestRoot && latestSubgroup && (
                latestRoot.y - latestSubgroup.y <= 30 ||
                (previousSameSubgroup !== undefined &&
                  previousSameSubgroup.y - latestSubgroup.y <= 60 &&
                  (latestSubgroup.signature.startsWith("columns:") ||
                    latestRoot.y - latestSubgroup.y <= 100))
            );
            const selectedGroups = rootContinues
                ? [latestRoot, latestSubgroup]
                : latestSubgroup
                  ? [latestSubgroup]
                  : latestRoot
                    ? [latestRoot]
                    : relevantGroups.slice(0, 1);
            const groupContext = selectedGroups.map((header) => header.text);
            const candidateColumnHeader = headerRows
                .flatMap((row) => row.columns)
                .filter((header) =>
                  Math.abs(header.x - sourceItem.x) <= 16 &&
                  header.y >= line.y &&
                  header.y - line.y <= 160,
                )
                .sort((a, b) =>
                  (a.y - line.y) - (b.y - line.y) ||
                  Math.abs(a.x - sourceItem.x) - Math.abs(b.x - sourceItem.x),
                )[0];
            const closestUnitHeader = unitHeaders
                .filter((header) => Math.abs(header.x - sourceItem.x) <= 45 && header.y >= line.y && header.y - line.y <= 160)
                .sort((a, b) => (a.y - line.y) - (b.y - line.y) || Math.abs(a.x - sourceItem.x) - Math.abs(b.x - sourceItem.x))[0];
            const groupHeaderY = Math.min(
                ...selectedGroups.map((header) => header.y),
                Number.POSITIVE_INFINITY,
            );
            const columnHeader = candidateColumnHeader &&
                (groupHeaderY === Number.POSITIVE_INFINITY || candidateColumnHeader.y <= groupHeaderY + 2)
                ? candidateColumnHeader
                : undefined;
            const contextHeaderY = Math.min(groupHeaderY, columnHeader?.y ?? Number.POSITIVE_INFINITY);
            const closestUnit = closestUnitHeader &&
                (contextHeaderY === Number.POSITIVE_INFINITY || closestUnitHeader.y <= contextHeaderY + 2)
                ? closestUnitHeader.unit
                : undefined;
            const normalized = normalizeServiceName(description);
            if (!normalized) continue;

            const unitContext = [
              ...groupContext,
              columnHeader?.text,
              closestUnit ? `$ x ${closestUnit}` : null,
            ].filter((part): part is string => Boolean(part));
            const distinctUnitContext = unitContext.filter((part, index) =>
              unitContext.findIndex((candidate) => normalizeServiceName(candidate) === normalizeServiceName(part)) === index,
            );
            const composedUnit = distinctUnitContext.length
              ? distinctUnitContext.join(" - ")
              : inferUnit(description);
            if (composedUnit.length > 240) continue;

            items.push({
              clave: `${pageNumber}:${line.y}:${sourceItem.x}:${amount}`,
              descripcion: description.replace(/\s+/g, " ").trim(),
              categoria: "Mano de obra",
              unidad: composedUnit,
              Valor: amount,
              pagina: pageNumber,
            });
          }
        }
      }
    }
  } finally {
    await loadingTask.destroy();
  }

  const unique = new Map<string, ExtractedAAIERICPrice>();
  for (const item of items) {
    const key = `${item.clave}:${normalizeServiceName(item.descripcion)}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return { items: [...unique.values()], fechaDocumento: readDocumentDate(documentText) };
}
