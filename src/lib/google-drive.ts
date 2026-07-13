// Minimal Google Drive REST client for the bank-files archive.
// Uses an access token minted from the same Google OAuth refresh token as the
// Gmail importer (the token now carries the drive.file scope). drive.file means
// the app can only see/manage files it created — exactly the archive tree it builds.

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  appProperties?: Record<string, string>;
};

function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function driveRequest<T>(
  accessToken: string,
  path: string,
  init?: RequestInit & { searchParams?: Record<string, string | undefined> }
): Promise<T> {
  const url = new URL(`${DRIVE_API}/${path}`);
  for (const [key, value] of Object.entries(init?.searchParams ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Drive request failed (${response.status}) for ${path}: ${detail.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

async function findChild(
  accessToken: string,
  parentId: string,
  name: string,
  mimeClause: string
): Promise<DriveFile | null> {
  const query = [
    `name = '${escapeDriveQueryValue(name)}'`,
    `'${escapeDriveQueryValue(parentId)}' in parents`,
    mimeClause,
    'trashed = false',
  ].join(' and ');
  const result = await driveRequest<{ files?: DriveFile[] }>(accessToken, 'files', {
    searchParams: {
      q: query,
      fields: 'files(id,name,mimeType,appProperties)',
      pageSize: '1',
      spaces: 'drive',
    },
  });
  return result.files?.[0] ?? null;
}

export async function ensureFolder(accessToken: string, name: string, parentId: string): Promise<string> {
  const existing = await findChild(accessToken, parentId, name, `mimeType = '${FOLDER_MIME}'`);
  if (existing) return existing.id;
  const created = await driveRequest<DriveFile>(accessToken, 'files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    searchParams: { fields: 'id' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  return created.id;
}

// Ensure a nested folder path exists (creating missing segments) and return the
// id of the deepest folder. Starts from the Drive root unless a rootId is given.
export async function ensureFolderPath(
  accessToken: string,
  segments: string[],
  rootId = 'root'
): Promise<string> {
  let parentId = rootId;
  for (const segment of segments) {
    parentId = await ensureFolder(accessToken, segment, parentId);
  }
  return parentId;
}

export async function findFileByAppProperty(
  accessToken: string,
  key: string,
  value: string
): Promise<DriveFile | null> {
  const result = await driveRequest<{ files?: DriveFile[] }>(accessToken, 'files', {
    searchParams: {
      q: `appProperties has { key='${escapeDriveQueryValue(key)}' and value='${escapeDriveQueryValue(value)}' } and trashed = false`,
      fields: 'files(id,name,mimeType,appProperties)',
      pageSize: '1',
      spaces: 'drive',
    },
  });
  return result.files?.[0] ?? null;
}

export async function uploadFile(input: {
  accessToken: string;
  parentId: string;
  name: string;
  mimeType: string;
  data: Buffer;
  appProperties?: Record<string, string>;
}): Promise<string> {
  const boundary = `hamba-${Math.random().toString(36).slice(2)}`;
  const metadata = {
    name: input.name,
    parents: [input.parentId],
    appProperties: input.appProperties ?? {},
  };
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`
    ),
    input.data,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const response = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Drive upload failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  const created = (await response.json()) as { id: string };
  return created.id;
}

export async function listFilesUnder(
  accessToken: string,
  rootId: string,
  options?: { extensions?: string[]; mimeTypes?: string[] }
): Promise<DriveFile[]> {
  const folderQueue: string[] = [rootId];
  const files: DriveFile[] = [];
  const extensions = new Set((options?.extensions ?? []).map((extension) => extension.toLowerCase()));
  const mimeTypes = new Set((options?.mimeTypes ?? []).map((mimeType) => mimeType.toLowerCase()));
  while (folderQueue.length) {
    const folderId = folderQueue.shift() as string;
    let pageToken: string | undefined;
    do {
      const page = await driveRequest<{ files?: DriveFile[]; nextPageToken?: string }>(accessToken, 'files', {
        searchParams: {
          q: `'${escapeDriveQueryValue(folderId)}' in parents and trashed = false`,
          fields: 'nextPageToken,files(id,name,mimeType,appProperties)',
          pageSize: '100',
          spaces: 'drive',
          pageToken,
        },
      });
      for (const file of page.files ?? []) {
        if (file.mimeType === FOLDER_MIME) folderQueue.push(file.id);
        else {
          const lowerName = file.name.toLowerCase();
          // A file passes when no filters were given, or when it matches at
          // least one provided filter. An omitted filter never auto-passes a
          // file on its own — otherwise supplying only `extensions` (or only
          // `mimeTypes`) would silently disable filtering entirely.
          const noFilters = extensions.size === 0 && mimeTypes.size === 0;
          const extensionMatch = Array.from(extensions).some((extension) => lowerName.endsWith(extension));
          const mimeMatch = mimeTypes.has(file.mimeType.toLowerCase());
          if (noFilters || extensionMatch || mimeMatch) files.push(file);
        }
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
  }
  return files;
}

// List all PDF files anywhere under a root folder.
export async function listPdfFilesUnder(accessToken: string, rootId: string): Promise<DriveFile[]> {
  return listFilesUnder(accessToken, rootId, {
    extensions: ['.pdf'],
    mimeTypes: ['application/pdf'],
  });
}

export async function downloadFile(accessToken: string, fileId: string): Promise<Buffer> {
  const response = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Drive download failed (${response.status}) for ${fileId}: ${detail.slice(0, 200)}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export const DRIVE_ARCHIVE_ROOT_FOLDER = 'Hamba Trading Bank Files';
