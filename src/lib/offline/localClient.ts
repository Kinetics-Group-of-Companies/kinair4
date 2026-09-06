import { LocalQueryBuilder } from './localQuery';
import { localAuth } from './localAuth';
import { localStorageApi } from './localStorageApi';
import { rewriteStorageUrls } from './fileCache';

/**
 * A drop-in stand-in for the Supabase JS client that reads and writes the local
 * IndexedDB mirror instead of the network.
 */
class OfflineQuery<T = any> extends LocalQueryBuilder<T> {
  then<R1 = any, R2 = never>(
    onfulfilled?: ((value: any) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: any) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return super.then((result: any) => {
      const mapped = { ...result, data: rewriteStorageUrls(result.data) };
      return onfulfilled ? onfulfilled(mapped) : (mapped as unknown as R1);
    }, onrejected);
  }
}

export const localClient = {
  from(table: string) {
    return new OfflineQuery(table);
  },
  auth: localAuth,
  storage: localStorageApi(),
  functions: {
    async invoke(name: string) {
      return {
        data: null,
        error: { message: `"${name}" needs an internet connection and is unavailable offline.` },
      };
    },
  },
  async rpc(name: string) {
    return {
      data: null,
      error: { message: `"${name}" is not available in offline mode.` },
    };
  },
  channel() {
    return {
      on() {
        return this;
      },
      subscribe() {
        return this;
      },
      unsubscribe() {
        return Promise.resolve('ok');
      },
    };
  },
  removeChannel() {
    return Promise.resolve('ok');
  },
};

export type LocalClient = typeof localClient;
