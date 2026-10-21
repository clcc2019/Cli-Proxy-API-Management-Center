import { authFilesApi } from '@/services/api/authFiles';
import { registerSessionCleanup } from '@/stores/sessionCleanup';
import type { AuthFileItem } from '@/types/authFile';
import type { CredentialInfo } from '@/types/sourceInfo';
import { AUTH_FILES_REFRESH_EVENT } from '@/utils/constants';
import { normalizeAuthIndex } from '@/utils/usage';

const AUTH_FILE_CREDENTIAL_MAP_STALE_TIME_MS = 240_000;
const EMPTY_AUTH_FILE_CREDENTIAL_MAP = new Map<string, CredentialInfo>();
const EMPTY_AUTH_FILE_INDEX: AuthFileItem[] = [];
const authFileIndexCache = new Map<string, { files: AuthFileItem[]; fetchedAt: number }>();
const authFileIndexRequests = new Map<string, Promise<AuthFileItem[]>>();
const authFileCredentialMapCache = new Map<
  string,
  { map: Map<string, CredentialInfo>; fetchedAt: number }
>();
const authFileCredentialMapRequests = new Map<string, Promise<Map<string, CredentialInfo>>>();
let authFileCredentialMapGeneration = 0;

export const invalidateAuthFileCredentialMapCache = () => {
  authFileCredentialMapGeneration += 1;
  authFileIndexCache.clear();
  authFileIndexRequests.clear();
  authFileCredentialMapCache.clear();
  authFileCredentialMapRequests.clear();
};

registerSessionCleanup('auth-file-credential-map', invalidateAuthFileCredentialMapCache);

if (typeof window !== 'undefined') {
  window.addEventListener(AUTH_FILES_REFRESH_EVENT, invalidateAuthFileCredentialMapCache);
}

const mapAuthFileCredentials = (files: AuthFileItem[]): Map<string, CredentialInfo> => {
  const map = new Map<string, CredentialInfo>();
  files.forEach((file) => {
    const key = normalizeAuthIndex(file.auth_index ?? file.authIndex);
    if (!key) return;
    map.set(key, {
      name: file.name || key,
      type: (file.type || file.provider || '').toString(),
    });
  });
  return map;
};

export const loadAuthFileIndex = (scopeKey: string): Promise<AuthFileItem[]> => {
  const cached = authFileIndexCache.get(scopeKey);
  if (cached && Date.now() - cached.fetchedAt < AUTH_FILE_CREDENTIAL_MAP_STALE_TIME_MS) {
    return Promise.resolve(cached.files);
  }

  const pending = authFileIndexRequests.get(scopeKey);
  if (pending) return pending;

  const generation = authFileCredentialMapGeneration;
  const request = authFilesApi
    .listAll({
      codexSubscription: 'skip',
      summary: true,
      includeRecentRequests: false,
    })
    .then((response) => {
      const files = Array.isArray(response.files) ? response.files : EMPTY_AUTH_FILE_INDEX;
      if (generation === authFileCredentialMapGeneration) {
        authFileIndexCache.set(scopeKey, { files, fetchedAt: Date.now() });
      }
      return files;
    })
    .finally(() => {
      if (authFileIndexRequests.get(scopeKey) === request) {
        authFileIndexRequests.delete(scopeKey);
      }
    });

  authFileIndexRequests.set(scopeKey, request);
  return request;
};

export const getCachedAuthFileCredentialMap = (scopeKey: string) => {
  const cached = authFileCredentialMapCache.get(scopeKey);
  if (!cached || Date.now() - cached.fetchedAt >= AUTH_FILE_CREDENTIAL_MAP_STALE_TIME_MS) {
    return EMPTY_AUTH_FILE_CREDENTIAL_MAP;
  }
  return cached.map;
};

export const loadAuthFileCredentialMap = (
  scopeKey: string
): Promise<Map<string, CredentialInfo>> => {
  const cached = authFileCredentialMapCache.get(scopeKey);
  if (cached && Date.now() - cached.fetchedAt < AUTH_FILE_CREDENTIAL_MAP_STALE_TIME_MS) {
    return Promise.resolve(cached.map);
  }

  const pending = authFileCredentialMapRequests.get(scopeKey);
  if (pending) return pending;

  const generation = authFileCredentialMapGeneration;
  const request = loadAuthFileIndex(scopeKey)
    .then((files) => {
      const map = mapAuthFileCredentials(files);
      if (generation === authFileCredentialMapGeneration) {
        authFileCredentialMapCache.set(scopeKey, { map, fetchedAt: Date.now() });
      }
      return map;
    })
    .finally(() => {
      if (authFileCredentialMapRequests.get(scopeKey) === request) {
        authFileCredentialMapRequests.delete(scopeKey);
      }
    });

  authFileCredentialMapRequests.set(scopeKey, request);
  return request;
};
