// Public browser configuration. Never put API tokens or secret keys in this file.
const APP_CONFIG = {
    api: {
        devUrl: 'http://127.0.0.1:8787',
        // Empty means same-origin API requests in production.
        prodUrl: '',
        timeout: 10000,
    },

    app: {
        name: 'My Flower Pots',
        version: '1.0.0',
        description: '花盆养护管理应用',
    },

    features: {
        enableImageUpload: true,
        enableWeather: false,
        enablePlantDatabase: false,
    },

    upload: {
        maxFileSize: 5 * 1024 * 1024,
        allowedTypes: [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp'
        ],
    },

    turnstile: {
        // Turnstile Site Keys are public browser identifiers, not secrets.
        siteKey: '0x4AAAAAADFSu3-u_W_mUeJ4',
        devSiteKey: '1x00000000000000000000AA',
    },

    frontend: {
        prodUrl: 'https://app.kaside365.com',
        devUrl: window.location.origin,
    },
};

const isDevelopment = window.location.hostname === 'localhost'
    || window.location.hostname === '127.0.0.1';

window.APP_CONFIG = {
    ...APP_CONFIG,
    isDevelopment,
    currentApiUrl: isDevelopment ? APP_CONFIG.api.devUrl : APP_CONFIG.api.prodUrl,
    turnstileSiteKey: isDevelopment
        ? APP_CONFIG.turnstile.devSiteKey
        : APP_CONFIG.turnstile.siteKey,
    getApiEndpoint: (path) => {
        const baseUrl = isDevelopment ? APP_CONFIG.api.devUrl : APP_CONFIG.api.prodUrl;
        return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    },
    isFeatureEnabled: (featureName) => APP_CONFIG.features[featureName] === true,
};
