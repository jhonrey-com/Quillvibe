import { parseExtensionFile, safeJsonParse } from './extensions';
import type { BookProject } from './types';

export interface EnterpriseSyncConfig {
  baseUrl: string;
  bookSyncId: string;
  authType: 'none' | 'bearer' | 'api-key';
  headerName: string;
  autoPullSec: number;
}

export interface EnterpriseSyncCheckResult {
  ok: boolean;
  status: number;
  message: string;
  remoteSha256?: string;
  updatedAt?: string;
}

const ENTERPRISE_SYNC_KEY = 'quillvibe.enterpriseSync.v1';
const ENTERPRISE_TOKEN_SESSION_KEY = 'quillvibe.enterpriseToken.session';
const REQUEST_TIMEOUT_MS = 15000;

export const DEFAULT_ENTERPRISE_SYNC_CONFIG: EnterpriseSyncConfig = {
  baseUrl: '',
  bookSyncId: '',
  authType: 'bearer',
  headerName: 'X-API-Key',
  autoPullSec: 0,
};

export const ENTERPRISE_SERVER_CONTRACT_DOC = `Quillvibe Self-Hosted / Website Sync REST Contract

1. Health / Capability Check (optional)
   GET <baseUrl>/health
   Headers: Authorization: Bearer <token> (or configured X-API-Key)
   Response 200 OK JSON: { "ok": true, "service": "quillvibe-sync" }

2. Pull Latest Book Snapshot
   GET <baseUrl>/books/<bookSyncId>
   Response 200 OK: Raw .qv JSON envelope OR { "content": "<serialized .qv JSON>", "sha256": "..." }

3. Push Book Revision
   PUT <baseUrl>/books/<bookSyncId>
   Headers: Content-Type: application/json, X-Quillvibe-Book-Id, X-Quillvibe-SHA256
   Body: Serialized .qv JSON envelope
   Response 200/201/204 OK`;

function isPrivateOrLocalHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/\.+$/, '');
  if (lower === 'localhost' || lower === '127.0.0.1' || lower === '[::1]' || lower === '::1') {
    return true;
  }
  const stripped = lower.startsWith('[') && lower.endsWith(']') ? lower.slice(1, -1) : lower;
  if (stripped.startsWith('fe80:') || stripped.startsWith('fc') || stripped.startsWith('fd') || stripped === '::ffff:127.0.0.1') {
    return true;
  }
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(stripped);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = Number(m[3]);
  const d = Number(m[4]);
  if (a > 255 || b > 255 || c > 255 || d > 255) return false;
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/**
 * Validates user-supplied enterprise sync server URLs.
 * Remote endpoints require HTTPS; HTTP is restricted strictly to localhost or private RFC1918 LAN hosts.
 */
export function validateSyncServerUrl(
  rawUrl: string,
): { ok: true; normalizedUrl: string; isLocal: boolean } | { ok: false; error: string } {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { ok: false, error: 'Enter your server or website sync endpoint URL.' };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: 'Invalid URL format. Include https:// (e.g. https://sync.example.com/api).' };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, error: 'Do not embed credentials in the URL; use the token field below.' };
  }

  const isLocal = isPrivateOrLocalHostname(parsed.hostname);
  if (parsed.protocol === 'http:') {
    if (!isLocal) {
      return {
        ok: false,
        error: 'Plain HTTP is blocked for public hosts. Use https:// for remote servers or websites.',
      };
    }
  } else if (parsed.protocol !== 'https:') {
    return { ok: false, error: 'Only https:// (or local http://) endpoints are allowed.' };
  }

  const normalized = parsed.toString().replace(/\/+$/, '');
  return { ok: true, normalizedUrl: normalized, isLocal };
}

export async function computeSha256Hex(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv-${(h >>> 0).toString(16).padStart(8, '0')}`;
}

export function loadEnterpriseSyncConfig(fallbackBookId: string): EnterpriseSyncConfig {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(ENTERPRISE_SYNC_KEY);
      if (raw) {
        const parsed = safeJsonParse<Partial<EnterpriseSyncConfig>>(raw);
        return {
          baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl.slice(0, 260) : '',
          bookSyncId:
            typeof parsed.bookSyncId === 'string' && parsed.bookSyncId.trim()
              ? parsed.bookSyncId.slice(0, 96)
              : fallbackBookId,
          authType:
            parsed.authType === 'none' || parsed.authType === 'api-key' || parsed.authType === 'bearer'
              ? parsed.authType
              : 'bearer',
          headerName:
            typeof parsed.headerName === 'string' && parsed.headerName.trim()
              ? parsed.headerName.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 48) || 'X-API-Key'
              : 'X-API-Key',
          autoPullSec: Number(parsed.autoPullSec) || 0,
        };
      }
    } catch {
      // Ignore malformed store
    }
  }
  return { ...DEFAULT_ENTERPRISE_SYNC_CONFIG, bookSyncId: fallbackBookId };
}

export function saveEnterpriseSyncConfig(cfg: EnterpriseSyncConfig): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(ENTERPRISE_SYNC_KEY, JSON.stringify(cfg));
    } catch {
      // Ignore quota limits
    }
  }
}

export function loadEnterpriseSessionToken(): string {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      return window.sessionStorage.getItem(ENTERPRISE_TOKEN_SESSION_KEY) ?? '';
    } catch {
      return '';
    }
  }
  return '';
}

export function saveEnterpriseSessionToken(token: string): void {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      if (token) window.sessionStorage.setItem(ENTERPRISE_TOKEN_SESSION_KEY, token);
      else window.sessionStorage.removeItem(ENTERPRISE_TOKEN_SESSION_KEY);
    } catch {
      // Ignore restricted session storage
    }
  }
}

function buildAuthHeaders(cfg: EnterpriseSyncConfig, token: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  const cleanToken = token.trim();
  if (cleanToken && cfg.authType === 'bearer') {
    headers.Authorization = `Bearer ${cleanToken}`;
  } else if (cleanToken && cfg.authType === 'api-key') {
    const safeName = cfg.headerName.replace(/[^a-zA-Z0-9-_]/g, '') || 'X-API-Key';
    headers[safeName] = cleanToken;
  }
  return headers;
}

function sanitizeSyncBookId(bookId: string, fallback: string): string {
  const cleaned = bookId.trim().replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 96);
  return cleaned || fallback;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, credentials: 'omit' });
  } finally {
    window.clearTimeout(timer);
  }
}

export async function testEnterpriseServer(
  cfg: EnterpriseSyncConfig,
  token: string,
): Promise<EnterpriseSyncCheckResult> {
  const check = validateSyncServerUrl(cfg.baseUrl);
  if (!check.ok) {
    return { ok: false, status: 0, message: check.error };
  }
  try {
    const res = await fetchWithTimeout(`${check.normalizedUrl}/health`, {
      method: 'GET',
      headers: buildAuthHeaders(cfg, token),
    });
    if (res.ok) {
      return {
        ok: true,
        status: res.status,
        message: `Connected (${check.isLocal ? 'Local Host' : 'TLS Verified'} — HTTP ${res.status})`,
      };
    }
    return {
      ok: false,
      status: res.status,
      message: `Server responded HTTP ${res.status}. Verify endpoint path and token.`,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message:
        err instanceof Error
          ? `Connection failed: ${err.message}`
          : 'Unable to reach sync endpoint (check HTTPS, server status, and CORS).',
    };
  }
}

export async function pullBookFromEnterpriseServer(
  cfg: EnterpriseSyncConfig,
  token: string,
  currentBook: BookProject,
): Promise<{ rawJson: string; sha256: string }> {
  const check = validateSyncServerUrl(cfg.baseUrl);
  if (!check.ok) throw new Error(check.error);

  const bookId = sanitizeSyncBookId(cfg.bookSyncId, currentBook.id);
  const res = await fetchWithTimeout(`${check.normalizedUrl}/books/${encodeURIComponent(bookId)}`, {
    method: 'GET',
    headers: buildAuthHeaders(cfg, token),
  });
  if (!res.ok) {
    throw new Error(`Remote pull failed with HTTP ${res.status}`);
  }

  const text = await res.text();
  const parsedJson = safeJsonParse<unknown>(text);
  const candidateRaw =
    parsedJson &&
    typeof parsedJson === 'object' &&
    !Array.isArray(parsedJson) &&
    typeof (parsedJson as Record<string, unknown>).content === 'string' &&
    !(parsedJson as Record<string, unknown>).magic
      ? ((parsedJson as Record<string, unknown>).content as string)
      : text;
  // Validate envelope structure before returning to caller
  parseExtensionFile(candidateRaw, 'enterprise-sync.qv');
  const sha256 = await computeSha256Hex(candidateRaw);
  return { rawJson: candidateRaw, sha256 };
}

export async function pushBookToEnterpriseServer(
  cfg: EnterpriseSyncConfig,
  token: string,
  currentBook: BookProject,
  serializedBookJson: string,
): Promise<{ sha256: string; status: number }> {
  const check = validateSyncServerUrl(cfg.baseUrl);
  if (!check.ok) throw new Error(check.error);

  const bookId = sanitizeSyncBookId(cfg.bookSyncId, currentBook.id);
  const sha256 = await computeSha256Hex(serializedBookJson);
  const res = await fetchWithTimeout(`${check.normalizedUrl}/books/${encodeURIComponent(bookId)}`, {
    method: 'PUT',
    headers: {
      ...buildAuthHeaders(cfg, token),
      'Content-Type': 'application/json',
      'X-Quillvibe-Book-Id': bookId,
      'X-Quillvibe-SHA256': sha256,
    },
    body: serializedBookJson,
  });
  if (!res.ok) {
    throw new Error(`Remote push failed with HTTP ${res.status}`);
  }
  return { sha256, status: res.status };
}
