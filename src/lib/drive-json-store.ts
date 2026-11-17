import { google, type drive_v3 } from "googleapis";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type JsonEntityName = "usuarios.json" | "perfiles.json" | "menu.json" | "productos.json" | "servicios.json" | "calendario.json" | "clientes.json" | "presupuestos.json" | "ordenes-trabajo.json";

let driveClient: drive_v3.Drive | undefined;
const driveFileIds = new Map<JsonEntityName, string>();
const driveFileLookups = new Map<JsonEntityName, Promise<string | null>>();
const driveInitializations = new Map<JsonEntityName, Promise<unknown>>();

function isDriveNotFoundError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && (error.code === 404 || error.code === "404")) return true;
  if ("status" in error && error.status === 404) return true;
  const response = "response" in error ? error.response : null;
  return Boolean(response && typeof response === "object" && "status" in response && response.status === 404);
}

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
  if (driveClient) return driveClient;

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

  driveClient = google.drive({ version: "v3", auth });
  return driveClient;
}

async function findDriveFile(drive: drive_v3.Drive, name: JsonEntityName) {
  const cachedId = driveFileIds.get(name);
  if (cachedId) return cachedId;

  const pendingLookup = driveFileLookups.get(name);
  if (pendingLookup) return pendingLookup;

  const folderId = process.env.GOOGLE_DRIVE_FILE_ID;
  if (!folderId) throw new Error("Falta configurar GOOGLE_DRIVE_FILE_ID.");

  const lookup = drive.files.list({
    q: `'${folderId}' in parents and name = '${name}' and trashed = false`,
    fields: "files(id,name)",
    pageSize: 1,
  }).then((response) => {
    const fileId = response.data.files?.[0]?.id ?? null;
    if (fileId) driveFileIds.set(name, fileId);
    return fileId;
  }).finally(() => {
    if (driveFileLookups.get(name) === lookup) driveFileLookups.delete(name);
  });
  driveFileLookups.set(name, lookup);

  return lookup;
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
    try {
      await drive.files.update({
        fileId,
        media: { mimeType: "application/json", body },
      });
    } catch (error) {
      if (isDriveNotFoundError(error)) driveFileIds.delete(name);
      throw error;
    }
    driveFileIds.set(name, fileId);
    return fileId;
  }

  const folderId = process.env.GOOGLE_DRIVE_FILE_ID;
  if (!folderId) throw new Error("Falta configurar GOOGLE_DRIVE_FILE_ID.");

  const response = await drive.files.create({
    requestBody: { name, mimeType: "application/json", parents: [folderId] },
    media: { mimeType: "application/json", body },
    fields: "id",
  });
  const createdFileId = response.data.id;
  if (!createdFileId) throw new Error(`Google Drive no devolvió el ID del archivo ${name}.`);
  driveFileIds.set(name, createdFileId);
  return createdFileId;
}

async function initializeDriveEntity<T>(
  drive: drive_v3.Drive,
  name: JsonEntityName,
  createInitialValue: () => Promise<T>,
): Promise<T> {
  const pendingInitialization = driveInitializations.get(name);
  if (pendingInitialization) return pendingInitialization as Promise<T>;

  const initialization = (async () => {
    const fileId = await findDriveFile(drive, name);
    if (fileId) return readDriveJson<T>(drive, fileId);

    const initialValue = await createInitialValue();
    await writeDriveJson(drive, name, initialValue, null);
    return initialValue;
  })();
  driveInitializations.set(name, initialization);

  try {
    return await initialization;
  } finally {
    if (driveInitializations.get(name) === initialization) driveInitializations.delete(name);
  }
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

    if (fileId) {
      try {
        return await readDriveJson<T>(drive, fileId);
      } catch (error) {
        if (isDriveNotFoundError(error)) driveFileIds.delete(name);
        throw error;
      }
    }
    return initializeDriveEntity(drive, name, createInitialValue);
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