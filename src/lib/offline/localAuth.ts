/**
 * Desktop auth. The first sign-in must happen online against the real cloud
 * account. That login is then remembered locally (email + salted password
 * hash + the cloud user record), so every later launch works with no internet:
 * the same email/password unlocks the app offline, and a still-valid remembered
 * session signs the user straight back in.
 */
import { getCloudClient, hasCloudConfig } from './cloudLink';
import { isOnline } from './mode';
import { getMeta, setMeta } from './localDb';

export const LOCAL_USER_ID = '00000000-0000-0000-0000-0000000000aa';
export let LOCAL_USER_EMAIL = '';

let currentUserId = LOCAL_USER_ID;

/** Binds local data ownership to the signed-in cloud user. */
export function adoptLocalUserId(userId: string) {
  if (!userId) return;
  currentUserId = userId;
}

export function getLocalUserId() {
  return currentUserId;
}

/* ------------------------------------------------------------------ */
/* remembered credentials                                              */
/* ------------------------------------------------------------------ */

const CREDENTIALS_KEY = 'offline_credentials';
const SESSION_KEY = 'offline_session';

interface StoredCredential {
  email: string;
  salt: string;
  hash: string;
  user: any;
  savedAt: string;
}

function normaliseEmail(email: string) {
  return String(email || '').trim().toLowerCase();
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashPassword(password: string, salt: string) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  return toHex(await crypto.subtle.digest('SHA-256', data));
}

async function loadCredentials(): Promise<StoredCredential[]> {
  return (await getMeta<StoredCredential[]>(CREDENTIALS_KEY, [])) ?? [];
}

/** Remembers an online login so the same user can sign in later with no internet. */
async function rememberCredential(email: string, password: string, user: any) {
  const normalised = normaliseEmail(email);
  if (!normalised || !password || !user?.id) return;
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const entry: StoredCredential = {
    email: normalised,
    salt,
    hash: await hashPassword(password, salt),
    user,
    savedAt: new Date().toISOString(),
  };
  const existing = (await loadCredentials()).filter((c) => c.email !== normalised);
  await setMeta(CREDENTIALS_KEY, [...existing, entry]);
}

export async function hasRememberedLogin(): Promise<boolean> {
  return (await loadCredentials()).length > 0;
}

function buildOfflineSession(user: any) {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: 'offline-session',
    refresh_token: 'offline-session',
    token_type: 'bearer',
    expires_in: 60 * 60 * 24 * 365,
    expires_at: now + 60 * 60 * 24 * 365,
    user,
  };
}

async function saveOfflineSession(session: any | null) {
  await setMeta(SESSION_KEY, session);
}

async function loadOfflineSession(): Promise<any | null> {
  return (await getMeta<any | null>(SESSION_KEY, null)) ?? null;
}

function offlineError(message: string) {
  return {
    data: { session: null, user: null },
    error: { message, name: 'AuthRetryableFetchError', status: 0 } as any,
  };
}

function requireOnline(action: string) {
  if (!hasCloudConfig) {
    return offlineError(`No cloud account is configured, so ${action} is unavailable.`);
  }
  if (!isOnline()) {
    return offlineError(`An internet connection is required to ${action}.`);
  }
  return null;
}

async function adoptFromSession(session: any) {
  const user = session?.user;
  if (!user?.id) return;
  adoptLocalUserId(user.id);
  LOCAL_USER_EMAIL = user.email ?? '';
  try {
    const { syncNow } = await import('./sync');
    void syncNow({ silent: true });
  } catch {
    /* sync is best-effort */
  }
}

/** Signs in from remembered credentials when the cloud cannot be reached. */
async function signInOffline(email: string, password: string) {
  const stored = (await loadCredentials()).find((c) => c.email === normaliseEmail(email));
  if (!stored) {
    return offlineError(
      'This account has not been used on this computer yet. Connect to the internet for the first sign-in.',
    );
  }
  const hash = await hashPassword(password, stored.salt);
  if (hash !== stored.hash) {
    return offlineError('Incorrect password.');
  }
  const session = buildOfflineSession(stored.user);
  await saveOfflineSession(session);
  adoptLocalUserId(stored.user.id);
  LOCAL_USER_EMAIL = stored.user.email ?? stored.email;
  notify('SIGNED_IN', session);
  return { data: { session, user: stored.user }, error: null };
}

/* ------------------------------------------------------------------ */
/* local auth-state listeners                                          */
/* ------------------------------------------------------------------ */

const listeners = new Set<(event: string, session: any) => void>();

function notify(event: string, session: any) {
  listeners.forEach((l) => {
    try {
      l(event, session);
    } catch {
      /* listener errors must not break auth */
    }
  });
}

export const localAuth = {
  async getSession() {
    const client = getCloudClient();
    // Never ask the cloud client to restore/refresh a token while disconnected.
    // It can wait on a network request and block the cached desktop session.
    if (client && isOnline()) {
      try {
        const result = await client.auth.getSession();
        if (result.data.session) {
          await adoptFromSession(result.data.session);
          return result;
        }
      } catch {
        // Windows can report online briefly after the connection disappears.
        // Continue to the local session instead of blocking desktop access.
      }
    }
    // No live cloud session — fall back to the remembered offline session.
    const cached = await loadOfflineSession();
    if (cached?.user?.id) {
      adoptLocalUserId(cached.user.id);
      LOCAL_USER_EMAIL = cached.user.email ?? '';
      return { data: { session: cached }, error: null };
    }
    return { data: { session: null }, error: null };
  },

  async getUser() {
    const { data } = await localAuth.getSession();
    return { data: { user: data.session?.user ?? null }, error: null };
  },

  async signInWithPassword(credentials: any) {
    const email = credentials?.email ?? '';
    const password = credentials?.password ?? '';

    if (!hasCloudConfig || !isOnline()) {
      return signInOffline(email, password);
    }

    const client = getCloudClient()!;
    let result: any;
    try {
      result = await client.auth.signInWithPassword(credentials);
    } catch {
      return signInOffline(email, password);
    }

    // Network failure while "online" — still let a remembered user in.
    if (result?.error && !result.data?.session) {
      const networkish = /fetch|network|timeout|Failed to/i.test(result.error.message ?? '');
      if (networkish) return signInOffline(email, password);
      return result;
    }

    if (result.data?.session) {
      await adoptFromSession(result.data.session);
      await saveOfflineSession(buildOfflineSession(result.data.session.user));
      await rememberCredential(email, password, result.data.session.user);
      try {
        const { saveSyncCredentials } = await import('./sync');
        if (email) await saveSyncCredentials(email);
      } catch {
        /* optional */
      }
    }
    return result;
  },

  async signUp(credentials: any) {
    const blocked = requireOnline('create an account');
    if (blocked) return blocked;
    const client = getCloudClient()!;
    const result = await client.auth.signUp(credentials);
    if (result.data?.session) {
      await adoptFromSession(result.data.session);
      await saveOfflineSession(buildOfflineSession(result.data.session.user));
      await rememberCredential(credentials?.email, credentials?.password, result.data.session.user);
    }
    return result;
  },

  async signInWithOAuth(params: any) {
    const blocked = requireOnline('sign in');
    if (blocked) return blocked;
    return getCloudClient()!.auth.signInWithOAuth(params);
  },

  async signOut() {
    const client = getCloudClient();
    currentUserId = LOCAL_USER_ID;
    LOCAL_USER_EMAIL = '';
    // Keep remembered credentials so the next offline sign-in still works;
    // only the active session is dropped.
    await saveOfflineSession(null);
    notify('SIGNED_OUT', null);
    try {
      const { clearSyncCredentials } = await import('./sync');
      await clearSyncCredentials();
    } catch {
      /* ignore */
    }
    if (!client) return { error: null };
    return client.auth.signOut();
  },

  async updateUser(attributes: any) {
    const blocked = requireOnline('update your account');
    if (blocked) return { data: { user: null }, error: blocked.error };
    return getCloudClient()!.auth.updateUser(attributes);
  },

  async resetPasswordForEmail(email: string, options?: any) {
    const blocked = requireOnline('reset your password');
    if (blocked) return { data: null, error: blocked.error };
    return getCloudClient()!.auth.resetPasswordForEmail(email, options);
  },

  async refreshSession() {
    const client = getCloudClient();
    if (!client || !isOnline()) {
      const { data } = await localAuth.getSession();
      return { data: { session: data.session, user: data.session?.user ?? null }, error: null };
    }
    const result = await client.auth.refreshSession();
    if (!result.data?.session) {
      const { data } = await localAuth.getSession();
      if (data.session) return { data: { session: data.session, user: data.session.user }, error: null };
    }
    return result;
  },

  async setSession(session: any) {
    const client = getCloudClient();
    if (!client) return { data: { session: null, user: null }, error: null };
    const result = await client.auth.setSession(session);
    if (result.data?.session) {
      await adoptFromSession(result.data.session);
      await saveOfflineSession(buildOfflineSession(result.data.session.user));
    }
    return result;
  },

  onAuthStateChange(callback: (event: string, session: any) => void) {
    listeners.add(callback);
    const client = getCloudClient();

    // Restore a remembered session when the cloud client has none (offline launch).
    void (async () => {
      let cloudSession = null;
      if (client && isOnline()) {
        try {
          cloudSession = (await client.auth.getSession()).data.session;
        } catch {
          // Fall through to the cached desktop session.
        }
      }
      if (cloudSession) return;
      const cached = await loadOfflineSession();
      if (cached?.user?.id) {
        adoptLocalUserId(cached.user.id);
        LOCAL_USER_EMAIL = cached.user.email ?? '';
        callback('SIGNED_IN', cached);
      }
    })();

    if (!client) {
      return {
        data: {
          subscription: {
            id: 'offline',
            callback,
            unsubscribe: () => listeners.delete(callback),
          },
        },
      };
    }

    const sub = client.auth.onAuthStateChange((event, session) => {
      if (session) {
        void adoptFromSession(session);
        void saveOfflineSession(buildOfflineSession(session.user));
      }
      // An expired cloud token must not log a remembered offline user out.
      if (event === 'SIGNED_OUT' && !session) {
        void (async () => {
          const cached = await loadOfflineSession();
          if (cached?.user?.id) {
            adoptLocalUserId(cached.user.id);
            callback('SIGNED_IN', cached);
            return;
          }
          currentUserId = LOCAL_USER_ID;
          callback(event, session);
        })();
        return;
      }
      callback(event, session);
    });

    const original = sub.data.subscription.unsubscribe.bind(sub.data.subscription);
    sub.data.subscription.unsubscribe = () => {
      listeners.delete(callback);
      original();
    };
    return sub;
  },
};
