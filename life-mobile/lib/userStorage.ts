'use client';

// ── Per-user namespaced localStorage helpers ──────────────────
// Global keys (legacy) -> namespaced keys `${base}_${suffix}`
// Suffix = email lowercased, non-alphanum -> '_', e.g. demo@camera505.ai -> demo_camera505_ai
// First read for a new user migrates the legacy global key once, then deletes it
// so the next user starts empty (no leak).

function getCurrentUserRaw(): { email: string; name: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('camera505_user');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function getUserSuffix(): string | null {
  const u = getCurrentUserRaw();
  if (!u?.email) return null;
  return u.email.toLowerCase().replace(/[^a-z0-9]/g, '_');
}

function nsKey(base: string): string {
  const suffix = getUserSuffix();
  return suffix ? `${base}_${suffix}` : base;
}

function migrateIfNeeded(base: string): void {
  if (typeof window === 'undefined') return;
  const suffix = getUserSuffix();
  if (!suffix) return;
  const namespaced = `${base}_${suffix}`;
  if (localStorage.getItem(namespaced) !== null) return;
  const legacy = localStorage.getItem(base);
  if (legacy !== null) {
    // Only migrate if legacy looks like it belongs to current user:
    // For history/profile/demo we migrate the legacy once, then delete legacy
    // so next user doesn't inherit it.
    localStorage.setItem(namespaced, legacy);
    localStorage.removeItem(base);
  }
}

export function getNamespacedItem(base: string): string | null {
  if (typeof window === 'undefined') return null;
  const suffix = getUserSuffix();
  if (!suffix) return localStorage.getItem(base);
  const namespaced = `${base}_${suffix}`;
  let val = localStorage.getItem(namespaced);
  if (val !== null) return val;
  migrateIfNeeded(base);
  return localStorage.getItem(namespaced);
}

export function setNamespacedItem(base: string, value: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(nsKey(base), value);
}

export function removeNamespacedItem(base: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(nsKey(base));
}

// ── Typed helpers ────────────────────────────────────────────
export function getHistory(): any[] {
  try {
    const raw = getNamespacedItem('camera505_history');
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function setHistory(arr: any[]): void {
  setNamespacedItem('camera505_history', JSON.stringify(arr));
}

export function getProfile(): any | null {
  try {
    const raw = getNamespacedItem('camera505_profile');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function setProfile(obj: any): void {
  setNamespacedItem('camera505_profile', JSON.stringify(obj));
}

export function getDemo(): any | null {
  try {
    const raw = getNamespacedItem('camera505_demo');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function setDemo(obj: any): void {
  setNamespacedItem('camera505_demo', JSON.stringify(obj));
}

export function getFirstTime(): string | null {
  return getNamespacedItem('camera505_first_time');
}

export function setFirstTime(val: string): void {
  setNamespacedItem('camera505_first_time', val);
}

export function clearCurrentUserData(): void {
  // Called on Sign Out if you want to wipe current user's local data.
  // We keep history/profile for next login, but you can uncomment to wipe:
  // removeNamespacedItem('camera505_history');
  // removeNamespacedItem('camera505_profile');
  // removeNamespacedItem('camera505_demo');
  // removeNamespacedItem('camera505_first_time');
}

export function getCurrentUser(): { email: string; name: string } | null {
  return getCurrentUserRaw();
}

export function getBackendUserId(): string {
  const u = getCurrentUserRaw();
  if (!u?.email) return 'demo_user';
  // Sanitized for filesystem: local_user/{user}/model
  return u.email.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 48) || 'demo_user';
}
