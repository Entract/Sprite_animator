import type { Animation } from '../types/animation';
import type { Skeleton } from '../types/skeleton';
import type { EditorMode } from '../types/project';
import type { ToolType } from '../stores/uiStore';

const DB_NAME = 'motionweaver2d';
const DB_VERSION = 1;
const STORE_NAME = 'kv';
const AUTOSAVE_KEY = 'session:autosave';
const NAMED_PREFIX = 'session:named:';

interface KVEntry<T = unknown> {
  key: string;
  value: T;
}

export interface PersistedUIState {
  mode: EditorMode;
  activeTool: ToolType;
  fuzzyThreshold: number;
  brushSize: number;
  selectedFrameId: string | null;
  currentFrameIndex: number;
  onionSkin: {
    enabled: boolean;
    prevCount: number;
    nextCount: number;
    opacity: number;
  };
  viewport: {
    zoom: number;
    panX: number;
    panY: number;
  };
  showGrid: boolean;
  leftPanelWidth: number;
  rightPanelWidth: number;
  timelineHeight: number;
}

export interface PersistedRigSelection {
  selectedSkeletonId: string | null;
  selectedBoneId: string | null;
  selectedIKConstraintId: string | null;
  selectedRigAnimationId: string | null;
  currentTime: number;
}

export interface PersistedSession {
  version: 2;
  name: string;
  savedAt: string;
  animations: Animation[];
  selectedAnimationId: string | null;
  skeletons: Skeleton[];
  rig: PersistedRigSelection;
  ui: PersistedUIState;
}

export interface NamedSessionInfo {
  name: string;
  savedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open session database'));
  });
}

function runRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

async function putValue<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await runRequest(store.put({ key, value } as KVEntry<T>));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
  } finally {
    db.close();
  }
}

async function getValue<T>(key: string): Promise<T | null> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const entry = await runRequest(store.get(key)) as KVEntry<T> | undefined;
    return entry?.value ?? null;
  } finally {
    db.close();
  }
}

async function deleteValue(key: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await runRequest(store.delete(key));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
  } finally {
    db.close();
  }
}

function namedKey(name: string): string {
  return `${NAMED_PREFIX}${encodeURIComponent(name)}`;
}

function decodeNamedKey(key: string): string {
  return decodeURIComponent(key.slice(NAMED_PREFIX.length));
}

export async function saveAutosaveSession(session: PersistedSession): Promise<void> {
  await putValue(AUTOSAVE_KEY, session);
}

export async function loadAutosaveSession(): Promise<PersistedSession | null> {
  return getValue<PersistedSession>(AUTOSAVE_KEY);
}

export async function saveNamedSession(name: string, session: PersistedSession): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Session name is required');
  }
  await putValue(namedKey(trimmed), { ...session, name: trimmed });
}

export async function loadNamedSession(name: string): Promise<PersistedSession | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  return getValue<PersistedSession>(namedKey(trimmed));
}

export async function deleteNamedSession(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  await deleteValue(namedKey(trimmed));
}

export async function listNamedSessions(): Promise<NamedSessionInfo[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const entries = await runRequest(store.getAll()) as KVEntry<PersistedSession>[];

    return entries
      .filter((entry) => typeof entry.key === 'string' && entry.key.startsWith(NAMED_PREFIX))
      .map((entry) => {
        const keyName = decodeNamedKey(entry.key);
        const name = entry.value?.name?.trim() || keyName;
        const savedAt = entry.value?.savedAt || '';
        return { name, savedAt };
      })
      .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  } finally {
    db.close();
  }
}
