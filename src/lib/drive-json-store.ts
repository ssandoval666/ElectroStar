import { google, type drive_v3 } from "googleapis";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type JsonEntityName = "usuarios.json" | "menu.json" | "productos.json" | "calendario.json" | "clientes.json" | "presupuestos.json" | "ordenes-trabajo.json";

function driveIsConfigured() {
  const credentials = [
    process.env.GOOGLE_DRIVE_FILE_ID,
    process.env.GOOGLE_CLIENT_EMAIL,
    process.env.GOOGLE_PRIVATE_KEY,
  ];
  const configuredCount = credentials.filter(Boolean).length;

  if (configuredCount > 0 && configuredCount < credentials.length) {
    throw new Error("Configurá GOOGLE_DRIVE_FILE_ID, GOOGLE_CLIENT_EMAIL y GOOGLE_PRIVATE_KEY juntos.");
  }

  return configuredCount === credentials.length;
}

function getDriveClient(): drive_v3.Drive {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !privateKey) {
    throw new Error("Falta configurar la cuenta de servicio de Google Drive.");
  }

  const auth = new google.auth.JWT({
    email,
    key: privateKey.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  return google.drive({ version: "v3", auth });
}

async function findDriveFile(drive: drive_v3.Drive, name: JsonEntityName) {
  const folderId = process.env.GOOGLE_DRIVE_FILE_ID;
  if (!folderId) throw new Error("Falta configurar GOOGLE_DRIVE_FILE_ID.");

  const response = await drive.files.list({
    q: `'${folderId}' in parents and name = '${name}' and trashed = false`,
    fields: "files(id,name)",
    pageSize: 1,
  });

  return response.data.files?.[0]?.id ?? null;
}

async function readDriveJson<T>(drive: drive_v3.Drive, fileId: string): Promise<T> {
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" },
  );
  const chunks: Buffer[] = [];

  for await (const chunk of response.data) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

async function writeDriveJson<T>(
  drive: drive_v3.Drive,
  name: JsonEntityName,
  value: T,
  fileId: string | null,
) {
  const body = JSON.stringify(value, null, 2);

  if (fileId) {
    await drive.files.update({
      fileId,
      media: { mimeType: "application/json", body },
    });
    return;
  }

  const folderId = process.env.GOOGLE_DRIVE_FILE_ID;
  if (!folderId) throw new Error("Falta configurar GOOGLE_DRIVE_FILE_ID.");

  await drive.files.create({
    requestBody: { name, mimeType: "application/json", parents: [folderId] },
    media: { mimeType: "application/json", body },
    fields: "id",
  });
}

function getLocalPath(name: JsonEntityName) {
  return path.join(process.cwd(), ".local-data", name);
}

export async function readJsonEntity<T>(
  name: JsonEntityName,
  createInitialValue: () => Promise<T>,
): Promise<T> {
  if (driveIsConfigured()) {
    const drive = getDriveClient();
    const fileId = await findDriveFile(drive, name);

    if (fileId) return readDriveJson<T>(drive, fileId);

    const initialValue = await createInitialValue();
    await writeDriveJson(drive, name, initialValue, null);
    return initialValue;
  }

  if (process.env.NODE_ENV !== "development") {
    throw new Error("Google Drive no está configurado para persistencia.");
  }

  const localPath = getLocalPath(name);
  await mkdir(path.dirname(localPath), { recursive: true });

  try {
    return JSON.parse(await readFile(localPath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;

    const initialValue = await createInitialValue();
    await writeFile(localPath, JSON.stringify(initialValue, null, 2), "utf8");
    return initialValue;
  }
}

export async function writeJsonEntity<T>(name: JsonEntityName, value: T) {
  if (driveIsConfigured()) {
    const drive = getDriveClient();
    const fileId = await findDriveFile(drive, name);
    await writeDriveJson(drive, name, value, fileId);
    return;
  }

  if (process.env.NODE_ENV !== "development") {
    throw new Error("Google Drive no está configurado para persistencia.");
  }

  const localPath = getLocalPath(name);
  await mkdir(path.dirname(localPath), { recursive: true });
  await writeFile(localPath, JSON.stringify(value, null, 2), "utf8");
}