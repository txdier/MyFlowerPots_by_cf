type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();

function isExpired(entry: CacheEntry<unknown>, now = Date.now()): boolean {
  return entry.expiresAt <= now;
}

export function getMemoryCache<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) {
    return null;
  }

  if (isExpired(entry)) {
    memoryCache.delete(key);
    return null;
  }

  return entry.value as T;
}

export function setMemoryCache<T>(key: string, value: T, ttlMs: number): T {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
  return value;
}

export function deleteMemoryCache(key: string): boolean {
  return memoryCache.delete(key);
}

export function deleteMemoryCachePrefix(prefix: string): number {
  let cleared = 0;
  for (const key of Array.from(memoryCache.keys())) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
      cleared++;
    }
  }
  return cleared;
}

export function clearMemoryCache(): number {
  const size = memoryCache.size;
  memoryCache.clear();
  return size;
}

export function getMemoryCacheStats() {
  const now = Date.now();
  const prefixes: Record<string, number> = {};

  for (const [key, entry] of Array.from(memoryCache.entries())) {
    if (isExpired(entry, now)) {
      memoryCache.delete(key);
      continue;
    }

    const prefix = key.includes(':') ? key.split(':')[0] : key;
    prefixes[prefix] = (prefixes[prefix] || 0) + 1;
  }

  return {
    size: memoryCache.size,
    prefixes
  };
}
