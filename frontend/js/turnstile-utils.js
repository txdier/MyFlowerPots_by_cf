(function () {
    const TURNSTILE_SCRIPT_TIMEOUT_MS = 8000;

    const getTurnstileSiteKey = () => {
        const config = window.APP_CONFIG || {};
        const turnstileConfig = config.turnstile || {};
        return config.turnstileSiteKey
            || (config.isDevelopment ? turnstileConfig.devSiteKey : turnstileConfig.siteKey)
            || '';
    };

    const waitForTurnstile = () => new Promise((resolve) => {
        if (window.turnstile?.render) {
            resolve(window.turnstile);
            return;
        }

        const startedAt = Date.now();
        const timer = window.setInterval(() => {
            if (window.turnstile?.render) {
                window.clearInterval(timer);
                resolve(window.turnstile);
                return;
            }

            if (Date.now() - startedAt >= TURNSTILE_SCRIPT_TIMEOUT_MS) {
                window.clearInterval(timer);
                resolve(null);
            }
        }, 100);
    });

    const createTurnstileController = ({ ref, computed, nextTick, contexts }) => {
        const siteKey = getTurnstileSiteKey();
        const states = {};

        Object.keys(contexts).forEach((key) => {
            states[key] = {
                token: ref(''),
                widgetId: null
            };
        });

        const isEnabled = computed(() => !!siteKey);

        const render = async (key) => {
            const context = contexts[key];
            const state = states[key];
            if (!context || !state || !siteKey || state.widgetId !== null) return;

            await nextTick();
            const container = document.getElementById(context.containerId);
            if (!container) return;

            const turnstile = await waitForTurnstile();
            if (!turnstile?.render) {
                state.token.value = '';
                return;
            }
            if (state.widgetId !== null || document.getElementById(context.containerId) !== container) {
                return;
            }

            state.widgetId = turnstile.render(container, {
                sitekey: siteKey,
                action: context.action,
                appearance: 'interaction-only',
                theme: 'auto',
                size: 'flexible',
                callback: (token) => {
                    state.token.value = token || '';
                },
                'expired-callback': () => {
                    state.token.value = '';
                },
                'error-callback': () => {
                    state.token.value = '';
                }
            });
        };

        const reset = (key) => {
            const state = states[key];
            if (!state) return;

            state.token.value = '';
            if (state.widgetId !== null && window.turnstile?.reset) {
                window.turnstile.reset(state.widgetId);
            }
        };

        const remove = (key) => {
            const state = states[key];
            if (!state) return;

            state.token.value = '';
            if (state.widgetId !== null && window.turnstile?.remove) {
                window.turnstile.remove(state.widgetId);
            }
            state.widgetId = null;
        };

        return {
            isEnabled,
            tokenFor: (key) => states[key]?.token,
            isReady: (key) => computed(() => !siteKey || !!states[key]?.token.value),
            render,
            reset,
            remove
        };
    };

    window.createTurnstileController = createTurnstileController;
})();
