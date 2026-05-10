(function () {
    const STORAGE_KEY = 'flowerpots_pwa_diagnostics';
    const ENABLED_KEY = 'flowerpots_pwa_diagnostics_enabled';
    const MAX_ENTRIES = 20;
    const QUICK_EXIT_MS = 3500;
    const startedAt = Date.now();

    const getLocalStorage = () => {
        try {
            return window.localStorage;
        } catch {
            return null;
        }
    };

    const getSessionStorage = () => {
        try {
            return window.sessionStorage;
        } catch {
            return null;
        }
    };

    const safeGetStorage = (storage, key) => {
        try {
            return storage?.getItem(key) || null;
        } catch {
            return null;
        }
    };

    const safeSetStorage = (storage, key, value) => {
        try {
            if (!storage) return false;
            storage.setItem(key, value);
            return true;
        } catch {
            return false;
        }
    };

    const safeRemoveStorage = (storage, key) => {
        try {
            storage?.removeItem(key);
        } catch {
            // Ignore diagnostic cleanup failures.
        }
    };

    const getUrlToggle = () => {
        try {
            const params = new URL(window.location.href).searchParams;
            if (!params.has('pwaDiagnostics')) return null;
            const value = String(params.get('pwaDiagnostics') || '').toLowerCase();
            return ['1', 'true', 'yes', 'on'].includes(value);
        } catch {
            return null;
        }
    };

    const getStoredToggle = () => {
        const value = String(safeGetStorage(getLocalStorage(), ENABLED_KEY) || '').toLowerCase();
        return ['1', 'true', 'yes', 'on'].includes(value);
    };

    const canUseStorage = (storage, prefix) => {
        if (!storage) return false;
        const key = `${prefix}_${Math.random().toString(36).slice(2)}`;
        try {
            storage.setItem(key, '1');
            storage.removeItem(key);
            return true;
        } catch {
            return false;
        }
    };

    const sanitizeUrl = (value) => {
        if (!value) return '';
        try {
            const url = new URL(value, window.location.origin);
            const keys = Array.from(url.searchParams.keys()).sort();
            return {
                origin: url.origin === window.location.origin ? 'same-origin' : url.origin,
                path: url.pathname || '/',
                queryKeys: keys,
                hash: Boolean(url.hash)
            };
        } catch {
            return '';
        }
    };

    const getDisplayMode = () => {
        if (window.navigator?.standalone === true) return 'ios-standalone';
        const modes = ['fullscreen', 'standalone', 'minimal-ui', 'window-controls-overlay', 'browser'];
        return modes.find(mode => {
            try {
                return window.matchMedia?.(`(display-mode: ${mode})`)?.matches;
            } catch {
                return false;
            }
        }) || 'unknown';
    };

    const loadEntries = () => {
        try {
            const raw = safeGetStorage(getLocalStorage(), STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    };

    const saveEntries = (entries) => {
        safeSetStorage(getLocalStorage(), STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
    };

    const urlToggle = getUrlToggle();
    let diagnosticsEnabled = urlToggle ?? getStoredToggle();
    if (urlToggle === true) {
        safeSetStorage(getLocalStorage(), ENABLED_KEY, '1');
    } else if (urlToggle === false) {
        safeRemoveStorage(getLocalStorage(), ENABLED_KEY);
    }

    const record = (event, extra = {}) => {
        if (!diagnosticsEnabled) return false;
        const entries = loadEntries();
        entries.push({
            event,
            ts: new Date().toISOString(),
            elapsedMs: Date.now() - startedAt,
            url: sanitizeUrl(window.location.href),
            referrer: sanitizeUrl(document.referrer),
            displayMode: getDisplayMode(),
            visibilityState: document.visibilityState || '',
            storage: {
                localStorage: canUseStorage(getLocalStorage(), 'flowerpots_pwa_local'),
                sessionStorage: canUseStorage(getSessionStorage(), 'flowerpots_pwa_session')
            },
            navigator: {
                platform: window.navigator?.platform || '',
                standalone: window.navigator?.standalone === true,
                userAgent: String(window.navigator?.userAgent || '').replace(/\s+/g, ' ').slice(0, 180)
            },
            ...extra
        });
        saveEntries(entries);
        return true;
    };

    let quickExitRecorded = false;
    const recordQuickExit = (event) => {
        if (quickExitRecorded) return;
        const elapsedMs = Date.now() - startedAt;
        if (elapsedMs <= QUICK_EXIT_MS) {
            quickExitRecorded = true;
            record(event, { quickExit: true });
        }
    };

    window.flowerpotsPwaDiagnostics = {
        get() {
            return loadEntries();
        },
        clear() {
            safeRemoveStorage(getLocalStorage(), STORAGE_KEY);
        },
        enable() {
            diagnosticsEnabled = true;
            safeSetStorage(getLocalStorage(), ENABLED_KEY, '1');
            record('enabled-manually');
        },
        disable() {
            diagnosticsEnabled = false;
            safeRemoveStorage(getLocalStorage(), ENABLED_KEY);
        },
        isEnabled() {
            return diagnosticsEnabled;
        }
    };

    if (!diagnosticsEnabled) return;

    record('load');

    window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
            record('pageshow-persisted');
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            recordQuickExit('hidden-after-load');
        }
    });

    window.addEventListener('pagehide', () => {
        recordQuickExit('pagehide-after-load');
    });

})();
