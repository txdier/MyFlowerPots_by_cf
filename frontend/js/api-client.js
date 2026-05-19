// API客户端配置 - 从全局配置中读取
const API_CONFIG = {
    // 基础URL从全局配置中获取
    // 如果全局配置不存在，使用默认值
    get baseUrl() {
        // 如果全局配置存在且有当前API地址，使用它
        if (window.APP_CONFIG && window.APP_CONFIG.currentApiUrl) {
            return window.APP_CONFIG.currentApiUrl;
        }

        // 默认值：开发环境使用本地服务器
        const isDev = window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.includes('localhost');

        return isDev ? 'http://127.0.0.1:8787' : '';
    },
    timeout: 10000, // 10秒超时
};

const AUTH_KEYS = {
    token: 'flowerpots_token',
    userId: 'flowerpots_user_id',
    remember: 'flowerpots_auth_remember',
};

const D1_BOOKMARK_HEADER = 'x-d1-bookmark';
const D1_BOOKMARK_KEY_PREFIX = 'flowerpots_d1_bookmark';
const SMART_MATCH_CACHE_PREFIX = 'flowerpots_smart_match';
const SMART_MATCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const AUTH_PERSISTENT_STORAGE = window.localStorage;
const AUTH_LEGACY_STORAGE = window.sessionStorage;

const getLocalDateString = (date = new Date()) => {
    if (window.MyFlowerPotsDate?.getLocalDateString) {
        return window.MyFlowerPotsDate.getLocalDateString(date);
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const safeStorageGet = (storage, key) => {
    try {
        return storage?.getItem(key) ?? null;
    } catch (error) {
        console.warn('Storage read failed:', key, error);
        return null;
    }
};

const safeStorageSet = (storage, key, value) => {
    try {
        storage?.setItem(key, value);
    } catch (error) {
        console.warn('Storage write failed:', key, error);
    }
};

const safeStorageRemove = (storage, key) => {
    try {
        storage?.removeItem(key);
    } catch (error) {
        console.warn('Storage remove failed:', key, error);
    }
};

const AUTH_STORAGE = {
    migrateLegacy() {
        const persistentToken = safeStorageGet(AUTH_PERSISTENT_STORAGE, AUTH_KEYS.token);
        const persistentUserId = safeStorageGet(AUTH_PERSISTENT_STORAGE, AUTH_KEYS.userId);
        const sessionToken = safeStorageGet(AUTH_LEGACY_STORAGE, AUTH_KEYS.token);
        const sessionUserId = safeStorageGet(AUTH_LEGACY_STORAGE, AUTH_KEYS.userId);

        // Migrate the most recent legacy session-based login into persistent storage.
        if ((!persistentToken || !persistentUserId) && sessionToken && sessionUserId) {
            safeStorageSet(AUTH_PERSISTENT_STORAGE, AUTH_KEYS.token, sessionToken);
            safeStorageSet(AUTH_PERSISTENT_STORAGE, AUTH_KEYS.userId, sessionUserId);
        }

        safeStorageRemove(AUTH_LEGACY_STORAGE, AUTH_KEYS.token);
        safeStorageRemove(AUTH_LEGACY_STORAGE, AUTH_KEYS.userId);
    },

    getToken() {
        return safeStorageGet(AUTH_PERSISTENT_STORAGE, AUTH_KEYS.token)
            || safeStorageGet(AUTH_LEGACY_STORAGE, AUTH_KEYS.token);
    },

    getUserId() {
        return safeStorageGet(AUTH_PERSISTENT_STORAGE, AUTH_KEYS.userId)
            || safeStorageGet(AUTH_LEGACY_STORAGE, AUTH_KEYS.userId);
    },

    getRemember() {
        const value = safeStorageGet(AUTH_PERSISTENT_STORAGE, AUTH_KEYS.remember)
            || safeStorageGet(AUTH_LEGACY_STORAGE, AUTH_KEYS.remember);
        return value === 'true';
    },

    setAuth(token, userId, options = {}) {
        if (token && userId) {
            const remember = options.remember === true;
            safeStorageSet(AUTH_PERSISTENT_STORAGE, AUTH_KEYS.token, token);
            safeStorageSet(AUTH_PERSISTENT_STORAGE, AUTH_KEYS.userId, userId);
            safeStorageSet(AUTH_PERSISTENT_STORAGE, AUTH_KEYS.remember, remember ? 'true' : 'false');
            safeStorageRemove(AUTH_LEGACY_STORAGE, AUTH_KEYS.token);
            safeStorageRemove(AUTH_LEGACY_STORAGE, AUTH_KEYS.userId);
            safeStorageRemove(AUTH_LEGACY_STORAGE, AUTH_KEYS.remember);
        } else {
            this.clear();
            return;
        }
    },

    clear() {
        safeStorageRemove(AUTH_LEGACY_STORAGE, AUTH_KEYS.token);
        safeStorageRemove(AUTH_LEGACY_STORAGE, AUTH_KEYS.userId);
        safeStorageRemove(AUTH_LEGACY_STORAGE, AUTH_KEYS.remember);
        safeStorageRemove(AUTH_PERSISTENT_STORAGE, AUTH_KEYS.token);
        safeStorageRemove(AUTH_PERSISTENT_STORAGE, AUTH_KEYS.userId);
        safeStorageRemove(AUTH_PERSISTENT_STORAGE, AUTH_KEYS.remember);
    }
};

AUTH_STORAGE.migrateLegacy();
window.authStorage = AUTH_STORAGE;

const emitAuthExpired = (message = '登录已过期，请重新登录') => {
    window.dispatchEvent(new CustomEvent('auth:expired', {
        detail: { message }
    }));
};

const APP_PAGES = {
    home: '/',
    error: 'error'
};

const ERROR_TYPE_DEFAULTS = {
    login_required: { open: 'login', notice: 'login_required', auto: '1' },
    session_expired: { open: 'login', notice: 'session_expired', auto: '1' },
    forbidden: { open: 'login', notice: 'forbidden', auto: '0' },
    admin_required: { open: 'none', notice: 'admin_required', auto: '0' },
    not_found: { open: 'none', notice: 'not_found', auto: '0' },
    link_expired: { open: 'register', notice: 'link_expired', auto: '0' },
    server_error: { open: 'none', notice: 'server_error', auto: '0' }
};

const buildQueryString = (params = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        const normalized = String(value).trim();
        if (!normalized) return;
        search.set(key, normalized);
    });
    return search.toString();
};

const normalizeAppPath = (value, options = {}) => {
    const { fallback = APP_PAGES.home, allowEmpty = false } = options;
    if (value == null) return allowEmpty ? '' : fallback;

    let normalized = String(value).trim();
    if (!normalized) return allowEmpty ? '' : fallback;

    try {
        normalized = decodeURIComponent(normalized);
    } catch {
        // Ignore malformed values and continue with the original string.
    }

    normalized = normalized.replace(/\\/g, '/');
    if (!normalized) return allowEmpty ? '' : fallback;
    if (/^[a-z][a-z0-9+.-]*:/i.test(normalized)) return allowEmpty ? '' : fallback;
    if (normalized.startsWith('//')) return allowEmpty ? '' : fallback;
    if (/[\r\n]/.test(normalized)) return allowEmpty ? '' : fallback;

    if (normalized.startsWith('?')) {
        normalized = `${APP_PAGES.home}${normalized}`;
    }

    normalized = normalized.replace(/^\.\/+/, '');
    if (normalized === '/' || normalized.startsWith('/?') || normalized.startsWith('/#')) {
        return normalized;
    }
    normalized = normalized.replace(/^\/+/, '');

    if (!normalized || normalized.split('/').includes('..')) return allowEmpty ? '' : fallback;

    const pathMatch = normalized.match(/^([^?#]*)([?#].*)?$/);
    if (pathMatch) {
        let pathPart = pathMatch[1].replace(/\.html$/i, '');
        const suffix = pathMatch[2] || '';
        if (pathPart === 'index') {
            normalized = suffix ? `${APP_PAGES.home}${suffix}` : APP_PAGES.home;
        } else {
            normalized = `${pathPart}${suffix}`;
        }
    }

    const normalizedPath = normalized.split(/[?#]/)[0];
    if (normalizedPath === APP_PAGES.error) {
        return allowEmpty ? '' : fallback;
    }

    return normalized;
};

const getCurrentAppPath = () => {
    const pathname = window.location.pathname.split('/').filter(Boolean).pop() || APP_PAGES.home;
    return normalizeAppPath(`${pathname}${window.location.search}${window.location.hash}`, {
        fallback: APP_PAGES.home
    });
};

const navigateToAppPage = (target, options = {}) => {
    const { replace = false } = options;
    if (replace) {
        window.location.replace(target);
    } else {
        window.location.href = target;
    }
    return target;
};

const buildIndexUrl = (options = {}) => {
    const redirect = normalizeAppPath(options.redirect, { fallback: '', allowEmpty: true });
    const query = buildQueryString({
        notice: options.notice,
        open: options.open,
        redirect,
        message: options.message,
        source: options.source
    });
    return query ? `${APP_PAGES.home}?${query}` : APP_PAGES.home;
};

const buildErrorUrl = (options = {}) => {
    const type = String(options.type || 'server_error').trim();
    const defaults = ERROR_TYPE_DEFAULTS[type] || ERROR_TYPE_DEFAULTS.server_error;
    const redirect = normalizeAppPath(options.redirect, { fallback: '', allowEmpty: true });
    const query = buildQueryString({
        type,
        redirect,
        from: options.from,
        open: options.open ?? defaults.open,
        notice: options.notice ?? defaults.notice,
        auto: options.auto ?? defaults.auto,
        message: options.message,
        source: options.source
    });
    return query ? `${APP_PAGES.error}?${query}` : APP_PAGES.error;
};

const readAppIntent = () => {
    const params = new URLSearchParams(window.location.search);
    return {
        type: params.get('type') || '',
        notice: params.get('notice') || '',
        open: params.get('open') || '',
        redirect: normalizeAppPath(params.get('redirect'), { fallback: '', allowEmpty: true }),
        message: params.get('message') || '',
        source: params.get('source') || '',
        from: params.get('from') || '',
        auto: params.get('auto') || ''
    };
};

const classifyApiError = (error) => {
    const status = Number(error?.status || 0);
    const message = String(error?.message || '').trim();

    if (status === 401 || /Authentication required|Unauthorized|No token|Invalid user/i.test(message)) {
        return 'auth';
    }
    if (status === 403 || /Forbidden|access denied|admin access required|account disabled/i.test(message)) {
        return 'forbidden';
    }
    if (status === 404 || /Not Found|not found|invalid or expired|已失效|不存在/i.test(message)) {
        return 'not_found';
    }
    return 'server';
};

const MyFlowerPotsNavigation = {
    APP_PAGES,
    ERROR_TYPE_DEFAULTS,
    normalizeAppPath,
    getCurrentAppPath,
    buildIndexUrl,
    buildErrorUrl,
    readAppIntent,
    classifyApiError,
    redirectToIndex(options = {}, navOptions = {}) {
        return navigateToAppPage(buildIndexUrl(options), navOptions);
    },
    redirectToError(options = {}, navOptions = {}) {
        return navigateToAppPage(buildErrorUrl(options), navOptions);
    },
    redirectToLoginRequired(options = {}, navOptions = {}) {
        return navigateToAppPage(buildErrorUrl({
            type: 'login_required',
            redirect: options.redirect || getCurrentAppPath(),
            ...options
        }), navOptions);
    },
    redirectToSessionExpired(message = '登录状态已失效，请重新登录。', options = {}, navOptions = {}) {
        return navigateToAppPage(buildErrorUrl({
            type: 'session_expired',
            message,
            redirect: options.redirect || getCurrentAppPath(),
            ...options
        }), navOptions);
    },
    redirectToAdminRequired(options = {}, navOptions = {}) {
        return navigateToAppPage(buildErrorUrl({
            type: 'admin_required',
            redirect: options.redirect || APP_PAGES.home,
            ...options
        }), navOptions);
    },
    redirectForApiError(error, options = {}, navOptions = {}) {
        const redirect = options.redirect || getCurrentAppPath();
        const classified = classifyApiError(error);

        if (classified === 'auth') {
            return this.redirectToError({
                type: options.authType || 'login_required',
                redirect,
                ...options
            }, navOptions);
        }
        if (classified === 'forbidden') {
            return this.redirectToError({
                type: options.forbiddenType || 'forbidden',
                redirect,
                ...options
            }, navOptions);
        }
        if (classified === 'not_found') {
            return this.redirectToError({
                type: options.notFoundType || 'not_found',
                redirect,
                ...options
            }, navOptions);
        }
        return this.redirectToError({
            type: options.serverType || 'server_error',
            redirect,
            ...options
        }, navOptions);
    }
};

window.MyFlowerPotsNavigation = MyFlowerPotsNavigation;

const PUBLIC_AUTH_ENDPOINTS = new Set([
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/identify',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
]);

const isPublicAuthEndpoint = (endpoint) => {
    const path = String(endpoint || '').split('?')[0];
    return PUBLIC_AUTH_ENDPOINTS.has(path) || path.startsWith('/api/public/');
};

const normalizeSmartMatchText = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

const hashSmartMatchKey = (value) => {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
};

// API客户端类
class APIClient {
    constructor(config = {}) {
        this.config = { ...API_CONFIG, ...config };
        this.token = AUTH_STORAGE.getToken();
        this.userId = AUTH_STORAGE.getUserId();
        this.rememberAuth = AUTH_STORAGE.getRemember();
        this.potsCacheVersion = Number(sessionStorage.getItem('pots_cache_version') || 0);
        if (this.token && !this.userId) {
            this.clearAuth();
        }
    }

    bumpPotsCacheVersion() {
        this.potsCacheVersion = Date.now();
        sessionStorage.setItem('pots_cache_version', String(this.potsCacheVersion));
    }

    // 设置认证令牌
    setToken(token, userId, options = {}) {
        this.token = token || null;
        this.userId = userId || null;
        const tokenRemember = this.parseTokenPayload(this.token)?.remember === true;
        this.rememberAuth = typeof options.remember === 'boolean' ? options.remember : tokenRemember;
        AUTH_STORAGE.setAuth(this.token, this.userId, { remember: this.rememberAuth });
    }

    // 清除认证信息
    clearAuth() {
        this.token = null;
        this.userId = null;
        this.rememberAuth = false;
        AUTH_STORAGE.clear();
    }

    getD1BookmarkStorageKey() {
        return `${D1_BOOKMARK_KEY_PREFIX}:${this.config.baseUrl || window.location.origin}`;
    }

    getD1Bookmark() {
        return safeStorageGet(AUTH_PERSISTENT_STORAGE, this.getD1BookmarkStorageKey());
    }

    setD1Bookmark(bookmark) {
        if (bookmark) {
            safeStorageSet(AUTH_PERSISTENT_STORAGE, this.getD1BookmarkStorageKey(), bookmark);
        }
    }

    captureD1Bookmark(response) {
        const bookmark = response.headers.get(D1_BOOKMARK_HEADER);
        if (bookmark) {
            this.setD1Bookmark(bookmark);
        }
    }

    getSmartMatchCacheKey({ potId, potName, potNote } = {}) {
        const id = String(potId || '').trim();
        if (!id) return null;
        const fingerprint = hashSmartMatchKey([
            normalizeSmartMatchText(potName),
            normalizeSmartMatchText(potNote)
        ].join('|'));
        return `${SMART_MATCH_CACHE_PREFIX}:${id}:${fingerprint}`;
    }

    readSmartMatchCache(input) {
        const key = this.getSmartMatchCacheKey(input);
        if (!key) return null;

        const raw = safeStorageGet(AUTH_LEGACY_STORAGE, key) || safeStorageGet(AUTH_PERSISTENT_STORAGE, key);
        if (!raw) return null;

        try {
            const cached = JSON.parse(raw);
            if (!cached || Date.now() - Number(cached.cachedAt || 0) > SMART_MATCH_CACHE_TTL_MS) {
                safeStorageRemove(AUTH_LEGACY_STORAGE, key);
                safeStorageRemove(AUTH_PERSISTENT_STORAGE, key);
                return null;
            }
            return cached.response || null;
        } catch {
            safeStorageRemove(AUTH_LEGACY_STORAGE, key);
            safeStorageRemove(AUTH_PERSISTENT_STORAGE, key);
            return null;
        }
    }

    writeSmartMatchCache(input, response) {
        const key = this.getSmartMatchCacheKey(input);
        if (!key || !response?.success) return;

        const payload = JSON.stringify({
            cachedAt: Date.now(),
            response
        });
        safeStorageSet(AUTH_LEGACY_STORAGE, key, payload);
        safeStorageSet(AUTH_PERSISTENT_STORAGE, key, payload);
    }

    // 刷新 JWT 令牌（使用当前已认证会话续签）
    // 使用锁机制防止并发刷新
    _refreshPromise = null;

    async refreshToken() {
        // 如果已有刷新操作在进行，等待它完成
        if (this._refreshPromise) {
            return this._refreshPromise;
        }

        if (!this.token || !this.userId) {
            console.warn('No active session available for token refresh');
            return false;
        }

        // 创建刷新 Promise 并存储
        this._refreshPromise = this._doRefreshToken();

        try {
            return await this._refreshPromise;
        } finally {
            this._refreshPromise = null;
        }
    }

    async _doRefreshToken() {
        try {
            const response = await fetch(`${this.config.baseUrl}/api/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`,
                    ...(this.getD1Bookmark() && { [D1_BOOKMARK_HEADER]: this.getD1Bookmark() })
                },
                body: JSON.stringify({ remember: this.rememberAuth === true })
            });

            this.captureD1Bookmark(response);

            if (response.ok) {
                const data = await response.json();
                if (data.success && data.token) {
                    this.setToken(data.token, data.userId);
                    return true;
                }
            }
        } catch (error) {
            console.error('Token refresh failed:', error);
        }
        return false;
    }

    parseTokenPayload(token = this.token) {
        if (!token) return null;

        try {
            const parts = token.split('.');
            if (parts.length !== 3) return null;

            const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
            return JSON.parse(atob(padded));
        } catch (error) {
            console.error('Error parsing token payload:', error);
            return null;
        }
    }

    isTokenExpired(bufferSeconds = 0) {
        const payload = this.parseTokenPayload();
        if (!payload?.exp) return false;
        return (payload.exp * 1000) <= (Date.now() + bufferSeconds * 1000);
    }


    // 检查令牌是否即将过期（默认 5 分钟内过期视为即将过期）
    isTokenExpiringSoon(thresholdMinutes = 5) {
        if (!this.token) return true;

        const payload = this.parseTokenPayload();
        if (!payload?.exp) return false;

        return this.isTokenExpired(thresholdMinutes * 60);
    }


    // 通用请求方法
    async request(endpoint, options = {}) {
        const shouldSendAuth = !!(this.token && !isPublicAuthEndpoint(endpoint));

        if (
            endpoint !== '/api/auth/refresh' &&
            shouldSendAuth &&
            this.userId &&
            this.isTokenExpiringSoon()
        ) {
            const refreshed = await this.refreshToken();
            if (!refreshed && this.isTokenExpired()) {
                this.clearAuth();
                emitAuthExpired();
            }
        }

        const method = (options.method || 'GET').toUpperCase();
        const url = `${this.config.baseUrl}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...(shouldSendAuth && { 'Authorization': `Bearer ${this.token}` }),
            ...(this.getD1Bookmark() && { [D1_BOOKMARK_HEADER]: this.getD1Bookmark() }),
            ...options.headers,
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        try {
            const response = await fetch(url, {
                method,
                headers,
                body: options.body ? JSON.stringify(options.body) : undefined,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);
            this.captureD1Bookmark(response);

            if (!response.ok) {
                const errorText = await response.text();
                const contentType = response.headers.get('content-type') || '';
                let errorData;
                try {
                    errorData = JSON.parse(errorText);
                } catch {
                    const looksLikeHtml = contentType.includes('text/html') || /^\s*<!doctype html/i.test(errorText) || /^\s*<html/i.test(errorText);
                    errorData = {
                        error: looksLikeHtml
                            ? `接口未命中或被静态页面接管: ${endpoint}`
                            : (errorText || `HTTP ${response.status}`)
                    };
                }

                if (response.status === 404 && endpoint === '/api/auth/me' && /user not found/i.test(errorData.error || '')) {
                    this.clearAuth();
                }

                // 处理 401 未授权：JWT 令牌过期或无效
                if (response.status === 401) {
                    const canRefresh = endpoint !== '/api/auth/refresh' &&
                        !isPublicAuthEndpoint(endpoint) &&
                        !!(this.token && this.userId) &&
                        (!this.isTokenExpired() || this.rememberAuth === true);
                    if (canRefresh) {
                        console.warn('Token expired or invalid, attempting refresh...');
                        const refreshed = await this.refreshToken();
                        if (refreshed) {
                            return this.request(endpoint, options);
                        }

                        console.warn('Token refresh failed, clearing auth...');
                        this.clearAuth();
                        emitAuthExpired(errorData.error || '登录已过期，请重新登录');
                    } else if (this.token) {
                        this.clearAuth();
                        emitAuthExpired(errorData.error || '登录已过期，请重新登录');
                    }
                }

                throw new APIError(response.status, errorData.error || '请求失败');
            }

	            const contentType = response.headers.get('content-type') || '';
	            if (contentType.includes('text/html')) {
	                throw new APIError(response.status || 0, `接口返回了 HTML 页面: ${endpoint}`);
	            }

	            if (options.responseType === 'blob') {
	                return response.blob();
	            }
	            if (options.responseType === 'text') {
	                return response.text();
	            }
	
	            const data = await response.json();
            if (method !== 'GET' && this.affectsPotList(endpoint)) {
                this.bumpPotsCacheVersion();
            }
            return data;

        } catch (error) {
            clearTimeout(timeoutId);

            if (error.name === 'AbortError') {
                throw new APIError(408, '请求超时');
            }

            if (error instanceof APIError) {
                throw error;
            }

            throw new APIError(0, error.message || '网络错误');
        }
    }

    affectsPotList(endpoint) {
        return endpoint.startsWith('/api/pots') ||
            endpoint.startsWith('/api/collaborators') ||
            endpoint.startsWith('/api/viewers') ||
            endpoint.startsWith('/api/share');
    }

    // 用户认证API
    async identify() {
        const result = await this.request('/api/auth/identify', { method: 'POST' });
        if (result.success && result.userId) {
            this.setToken(result.token, result.userId, { remember: false });
        }
        return result;
    }

    async login(email, password, remember = true) {
        const result = await this.request('/api/auth/login', {
            method: 'POST',
            body: { email, password, remember: remember !== false }
        });

        if (result.token && result.userId) {
            this.setToken(result.token, result.userId, { remember: remember !== false });
        }

        return result;
    }

    async register(email, password, displayName, turnstileToken, remember = true) {
        const result = await this.request('/api/auth/register', {
            method: 'POST',
            body: { email, password, displayName, turnstileToken, remember: remember !== false }
        });

        if (result.token && result.userId) {
            this.setToken(result.token, result.userId, { remember: remember !== false });
        }

        return result;
    }

    async upgrade(email, password, displayName, anonymousUserId, turnstileToken, remember = true) {
        const result = await this.request('/api/auth/upgrade', {
            method: 'POST',
            body: { email, password, displayName, anonymousUserId, turnstileToken, remember: remember !== false }
        });

        if (result.token && result.userId) {
            this.setToken(result.token, result.userId, { remember: remember !== false });
        }

        return result;
    }

    async getCurrentUser() {
        return this.request('/api/auth/me');
    }

    async getBootstrap() {
        return this.request('/api/bootstrap');
    }

    async getUserProfile() {
        return this.getCurrentUser();
    }

    async updateProfile({ displayName, avatarUrl } = {}) {
        return this.request('/api/auth/profile', {
            method: 'PUT',
            body: { displayName, avatarUrl }
        });
    }

    async updatePassword(currentPassword, newPassword) {
        return this.request('/api/auth/password', {
            method: 'PUT',
            body: { currentPassword, newPassword }
        });
    }

    async changeEmail(newEmail) {
        return this.request('/api/auth/change-email', {
            method: 'POST',
            body: { newEmail }
        });
    }

    async sendVerificationEmail() {
        return this.request('/api/auth/send-verification-email', {
            method: 'POST'
        });
    }

    async logout() {
        this.clearAuth();
        return { success: true };
    }

    async forgotPassword(email, turnstileToken) {
        return this.request('/api/auth/forgot-password', {
            method: 'POST',
            body: { email, turnstileToken }
        });
    }

    async resetPassword(token, newPassword) {
        return this.request('/api/auth/reset-password', {
            method: 'POST',
            body: { token, newPassword }
        });
    }

    // 花盆管理API
    async getPots(options = {}) {
        const legacyUserId = typeof options === 'string' ? options : this.userId;
        // 优化：如果没有用户ID（未登录且未创建匿名账户），直接返回空数组，避免无效API调用
        if (!legacyUserId) {
            return { success: true, data: [] };
        }
        const status = typeof options === 'object' && options !== null ? options.status : '';
        const page = typeof options === 'object' && options !== null ? options.page : null;
        const limit = typeof options === 'object' && options !== null ? options.limit : null;
        const params = new URLSearchParams();
        if (status) params.set('status', status);
        if (page) params.set('page', String(page));
        if (limit) params.set('limit', String(limit));
        if (this.potsCacheVersion) params.set('_v', String(this.potsCacheVersion));
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.request(`/api/pots${query}`);
    }

    async getPotDetail(potId) {
        return this.request(`/api/pots/${potId}`);
    }

    async getPotDetailBundle(potId) {
        return this.request(`/api/pots/${potId}/detail-bundle`);
    }

    async markPotActivityRead(potId) {
        return this.request(`/api/pots/${potId}/activity/read`, { method: 'POST' });
    }

    async getPotStatusCounts() {
        if (!this.userId) {
            return { success: true, data: { active: 0, archived: 0 } };
        }
        return this.request('/api/pots/counts');
    }

    // 分享管理
    async enableShare(potId) {
        return this.request(`/api/share/enable/${potId}`, { method: 'POST' });
    }

    async disableShare(potId) {
        return this.request(`/api/share/disable/${potId}`, { method: 'POST' });
    }

    async setCommentDanmakuVisibility(potId, enabled) {
        return this.request(`/api/share/comment-danmaku/${potId}`, {
            method: 'POST',
            body: { enabled }
        });
    }

    async getPublicPotDetail(token, options = {}) {
        const params = new URLSearchParams();
        if (options.careLimit) params.set('careLimit', String(options.careLimit));
        if (options.timelineLimit) params.set('timelineLimit', String(options.timelineLimit));
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.request(`/api/public/pots/${token}${query}`);
    }

    async getPublicPotDetailById(potId, options = {}) {
        const params = new URLSearchParams();
        if (options.careLimit) params.set('careLimit', String(options.careLimit));
        if (options.timelineLimit) params.set('timelineLimit', String(options.timelineLimit));
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.request(`/api/public/pots/by-id/${encodeURIComponent(potId)}${query}`);
    }

    // 协作者管理
    async getCollaborators(potId) {
        return this.request(`/api/collaborators/${potId}`);
    }

    async createCollaboratorInvite(potId) {
        return this.request(`/api/collaborators/invite/${potId}`, { method: 'POST' });
    }

    async openCollaboratorInvite(token, sessionId) {
        return this.request(`/api/collaborators/open/${token}`, {
            method: 'POST',
            body: { sessionId }
        });
    }

    async acceptCollaboratorInvite(token, sessionId) {
        return this.request(`/api/collaborators/accept/${token}`, {
            method: 'POST',
            body: { sessionId }
        });
    }

    async getViewers(potId) {
        return this.request(`/api/viewers/${potId}`);
    }

    async addViewer(potId, email) {
        return this.request(`/api/viewers/${potId}`, {
            method: 'POST',
            body: { email }
        });
    }

    async removeViewer(potId, userId) {
        return this.request(`/api/viewers/${potId}/${userId}`, { method: 'DELETE' });
    }

    async updatePotMemberRole(potId, userId, role) {
        return this.request(`/api/pots/${potId}/members/${userId}/role`, {
            method: 'PATCH',
            body: { role }
        });
    }

    async leaveViewer(potId) {
        return this.request(`/api/viewers/${potId}`, { method: 'DELETE' });
    }

    async createViewerInvite(potId) {
        return this.request(`/api/viewers/invite/${potId}`, { method: 'POST' });
    }

    async openViewerInvite(token, sessionId) {
        return this.request(`/api/viewers/open/${token}`, {
            method: 'POST',
            body: { sessionId }
        });
    }

    async acceptViewerInvite(token, sessionId) {
        return this.request(`/api/viewers/accept/${token}`, {
            method: 'POST',
            body: { sessionId }
        });
    }

    async createBatchInvite(potIds, permission) {
        return this.request('/api/batch-invites', {
            method: 'POST',
            body: { potIds, permission }
        });
    }

    async openBatchInvite(token, sessionId) {
        return this.request(`/api/batch-invites/open/${token}`, {
            method: 'POST',
            body: { sessionId }
        });
    }

    async acceptBatchInvite(token, sessionId) {
        return this.request(`/api/batch-invites/accept/${token}`, {
            method: 'POST',
            body: { sessionId }
        });
    }

    async addCollaborator(potId, email) {
        return this.request(`/api/collaborators/${potId}`, {
            method: 'POST',
            body: { email }
        });
    }

    async removeCollaborator(potId, collaboratorUserId) {
        return this.request(`/api/collaborators/${potId}/${collaboratorUserId}`, {
            method: 'DELETE'
        });
    }

    async leaveCollaboration(potId) {
        return this.request(`/api/collaborators/${potId}`, {
            method: 'DELETE'
        });
    }

    // 所有权转移
    async initTransfer(potId, targetEmail) {
        return this.request(`/api/transfer/init/${potId}`, { 
            method: 'POST',
            body: { targetEmail }
        });
    }

    async cancelTransfer(potId) {
        return this.request(`/api/transfer/cancel/${potId}`, { method: 'POST' });
    }

    async getTransferPotDetail(token) {
        return this.request(`/api/public/transfer/${token}`);
    }

    async acceptTransfer(token) {
        return this.request(`/api/transfer/accept/${token}`, { method: 'POST' });
    }

    async rejectTransfer(token) {
        return this.request(`/api/transfer/reject/${token}`, { method: 'POST' });
    }

    // 消息中心
    async getMessages() {
        return this.request('/api/messages');
    }

    async getUnreadMessageCount() {
        return this.request('/api/messages/unread-count');
    }

    async markMessageRead(id) {
        return this.request(`/api/messages/${id}/read`, { method: 'POST' });
    }

    async markAllMessagesRead() {
        return this.request('/api/messages/read-all', { method: 'POST' });
    }

    async deleteMessage(id) {
        return this.request(`/api/messages/${id}`, { method: 'DELETE' });
    }

    async clearReadMessages() {
        return this.request('/api/messages/clear-read', { method: 'POST' });
    }

    async getSupportUnreadCount() {
        return this.request('/api/admin/support/unread-count');
    }

    async adminGetSupportEmails(page = 1) {
        return this.request(`/api/admin/support/emails?page=${encodeURIComponent(page)}`);
    }

    async adminGetSupportEmail(emailId) {
        return this.request(`/api/admin/support/emails/${encodeURIComponent(emailId)}`);
    }

    async adminReplySupportEmail(emailId, body) {
        return this.request(`/api/admin/support/emails/${encodeURIComponent(emailId)}/reply`, {
            method: 'POST',
            body: { body }
        });
    }

    async adminDeleteSupportEmail(emailId) {
        return this.request(`/api/admin/support/emails/${encodeURIComponent(emailId)}`, {
            method: 'DELETE'
        });
    }

    async adminDownloadSupportAttachment(emailId, filename) {
        return this.request(
            `/api/admin/support/emails/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(filename)}`,
            { responseType: 'blob' }
        );
    }

    async sendPotComment(potId, content, shareToken = null) {
        return this.request('/api/messages/pot-comment', {
            method: 'POST',
            body: { potId, content, shareToken }
        });
    }

    async replyPotComment(commentId, content, shareToken = null) {
        return this.request('/api/messages/pot-comment-reply', {
            method: 'POST',
            body: { commentId, content, shareToken }
        });
    }

    async getPotComments(potId, shareToken = null) {
        const query = shareToken ? `?shareToken=${encodeURIComponent(shareToken)}` : '';
        return this.request(`/api/messages/pot-comments/${potId}${query}`);
    }

    async deletePotComment(commentId) {
        return this.request(`/api/messages/pot-comment/${commentId}`, { method: 'DELETE' });
    }

    async createPot(potData) {
        // 优化：如果当前没有用户ID，说明是纯浏览的匿名用户，此时才延迟创建匿名账户
        if (!this.userId) {
            const identifyResult = await this.identify();
            if (identifyResult.success && identifyResult.userId) {
                // identify 内部已经调用了 setToken，所以 this.userId 现在已有值
                potData.userId = this.userId;
            } else {
                throw new Error('无法初始化匿名账户，请重试');
            }
        }

        return this.request('/api/pots', {
            method: 'POST',
            body: potData
        });
    }

    async updatePot(potId, potData, userId = this.userId) {
        if (!userId) {
            throw new APIError(400, '用户ID不能为空');
        }
        return this.request(`/api/pots/${potId}`, {
            method: 'PUT',
            body: potData
        });
    }

    async deletePot(potId, userId = this.userId) {
        if (!userId) {
            throw new APIError(400, '用户ID不能为空');
        }
        return this.request(`/api/pots/${potId}`, {
            method: 'DELETE'
        });
    }

    async archivePot(potId, data = {}) {
        if (!this.userId) {
            throw new APIError(400, '用户ID不能为空');
        }
        return this.request(`/api/pots/${potId}/archive`, {
            method: 'POST',
            body: data
        });
    }

    async restorePot(potId) {
        if (!this.userId) {
            throw new APIError(400, '用户ID不能为空');
        }
        return this.request(`/api/pots/${potId}/restore`, {
            method: 'POST'
        });
    }

    async batchArchivePots(data) {
        if (!this.userId) {
            throw new APIError(400, '用户ID不能为空');
        }
        return this.request('/api/pots/archive', {
            method: 'POST',
            body: data
        });
    }

    async reorderPots(potIds) {
        if (!this.userId) {
            throw new APIError(400, '用户ID不能为空');
        }
        return this.request('/api/pots/reorder', {
            method: 'PUT',
            body: { potIds }
        });
    }

    // 养护记录API
    async getCareRecords(potId) {
        return this.request(`/api/care-records/${potId}`);
    }

    async getCareRecordDetail(recordId) {
        return this.request(`/api/care-records/detail/${recordId}`);
    }

    async createCareRecord(recordData) {
        return this.request('/api/care-records', {
            method: 'POST',
            body: recordData
        });
    }

    async batchCreateCareRecord(data) {
        return this.request('/api/care-records/batch', {
            method: 'POST',
            body: data
        });
    }

    async updateCareRecord(recordId, recordData) {
        return this.request(`/api/care-records/${recordId}`, {
            method: 'PUT',
            body: recordData
        });
    }

    async deleteCareRecord(recordId) {
        return this.request(`/api/care-records/${recordId}`, {
            method: 'DELETE'
        });
    }

    // 养护计划API
    async getCareSchedules(potId = null) {
        if (potId) {
            return this.request(`/api/care-schedules/pot/${potId}`);
        }
        return this.request('/api/care-schedules');
    }

    async getCareReminders() {
        return this.request('/api/care-schedules/reminders');
    }

    async createCareSchedule(scheduleData) {
        return this.request('/api/care-schedules', {
            method: 'POST',
            body: scheduleData
        });
    }

    async updateCareSchedule(scheduleId, data) {
        return this.request(`/api/care-schedules/${scheduleId}`, {
            method: 'PUT',
            body: data
        });
    }

    async deleteCareSchedule(scheduleId) {
        return this.request(`/api/care-schedules/${scheduleId}`, {
            method: 'DELETE'
        });
    }

    // 时间线API
    async getTimelines(potId, options = {}) {
        const params = new URLSearchParams();
        if (options.limit) params.set('limit', String(options.limit));
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.request(`/api/pots/${potId}/timelines${query}`);
    }

    // 花盆养护统计API
    async getPotStats(potId) {
        return this.request(`/api/pots/${potId}/stats`);
    }

    async createTimeline(timelineData) {
        return this.request('/api/timelines', {
            method: 'POST',
            body: timelineData
        });
    }

    async updateTimeline(timelineId, timelineData) {
        return this.request(`/api/timelines/${timelineId}`, {
            method: 'PUT',
            body: timelineData
        });
    }

    async deleteTimeline(timelineId) {
        return this.request(`/api/timelines/${timelineId}`, {
            method: 'DELETE'
        });
    }

    // 天气API
    async getWeather(location = null) {
        const params = location ? `?location=${encodeURIComponent(location)}` : '';
        return this.request(`/api/weather${params}`);
    }

    // 养护建议API
    async getCareAdvice(data) {
        return this.request('/api/care-advice', {
            method: 'POST',
            body: data
        });
    }

    // 植物数据库API
    async searchPlants(query) {
        return this.request(`/api/plants/search?q=${encodeURIComponent(query)}`);
    }

    async getPlantInfo(plantId) {
        return this.request(`/api/plants/${plantId}`);
    }

    // 智能植物匹配API
    async smartMatchPlant(potName, potNote = '', options = {}) {
        const cacheInput = { potId: options.potId, potName, potNote };
        const cached = this.readSmartMatchCache(cacheInput);
        if (cached) return cached;

        const result = await this.request('/api/plants/smart-match', {
            method: 'POST',
            body: { potName, potNote }
        });
        this.writeSmartMatchCache(cacheInput, result);
        return result;
    }

    async smartMatchPlants(items = []) {
        const normalizedItems = (Array.isArray(items) ? items : [])
            .map((item, index) => ({
                key: String(item?.key || item?.potId || index),
                potId: item?.potId || null,
                potName: item?.potName ?? item?.name ?? '',
                potNote: item?.potNote ?? item?.note ?? ''
            }));

        const responses = new Array(normalizedItems.length);
        const misses = [];
        normalizedItems.forEach((item, index) => {
            const cached = this.readSmartMatchCache(item);
            if (cached) {
                responses[index] = { key: item.key, potId: item.potId, ...cached };
            } else {
                misses.push({ ...item, index });
            }
        });

        if (misses.length > 0) {
            const batch = await this.request('/api/plants/smart-match/batch', {
                method: 'POST',
                body: {
                    items: misses.map(({ index, ...item }) => item)
                }
            });
            const byKey = new Map((batch.data || []).map((item) => [String(item.key), item]));
            for (const miss of misses) {
                const itemResult = byKey.get(miss.key) || {
                    key: miss.key,
                    potId: miss.potId,
                    success: false,
                    data: null,
                    message: '智能匹配失败'
                };
                responses[miss.index] = itemResult;
                this.writeSmartMatchCache(miss, itemResult);
            }
        }

        return { success: true, data: responses };
    }

    // 图片上传API
    async uploadImage(file, options = {}) {
        const {
            potId = null,
            uploadType = 'pot', // 'pot' | 'timeline' | 'care'
            entityId = null
        } = options;

        const formData = new FormData();
        formData.append('image', file);

        // 优先使用新的参数
        if (uploadType) {
            formData.append('uploadType', uploadType);
        }

        // 根据新的目录结构调整：
        // 1. 花盆图片：不需要potId（后端会忽略）
        // 2. 时间线图片：需要potId
        // 3. 养护记录图片：需要potId

        // 向后兼容：支持旧的entityId参数
        const finalPotId = entityId || potId;

        // 对于花盆图片，即使有potId也传递，但后端会忽略
        // 对于时间线和养护记录，必须传递potId
        if (finalPotId) {
            formData.append('potId', finalPotId);
        }

        const url = `${this.config.baseUrl}/api/upload/image`;

        // 重要：不要设置 Content-Type 头，浏览器会自动设置正确的 multipart/form-data
        const headers = {};
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new APIError(response.status, errorText || '图片上传失败');
        }

        return response.json();
    }

    // 管理员API
    async adminCheck() {
        return this.request('/api/admin/check');
    }

    async adminGetAnalytics({ startDate = '', endDate = '' } = {}) {
        const params = new URLSearchParams();
        if (startDate && endDate) {
            params.set('startDate', startDate);
            params.set('endDate', endDate);
        }
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.request(`/api/admin/analytics${query}`);
    }

    async adminGetCacheStats() {
        return this.request('/api/admin/cache/stats');
    }

    async adminClearCache({ scope = 'all', prefix = '' } = {}) {
        return this.request('/api/admin/cache/clear', {
            method: 'POST',
            body: { scope, prefix }
        });
    }

    async adminGetPlants(page = 1, pageSize = 20, search = '') {
        return this.request(`/api/admin/plants?page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(search)}`);
    }

    async adminExportPlants(search = '') {
        return this.request(`/api/admin/plants/export?search=${encodeURIComponent(search)}`);
    }

    async adminCreatePlant(plantData) {
        return this.request('/api/admin/plants', {
            method: 'POST',
            body: plantData
        });
    }

    async adminUpdatePlant(plantId, plantData) {
        return this.request(`/api/admin/plants/${plantId}`, {
            method: 'PUT',
            body: plantData
        });
    }

    async adminDeletePlant(plantId) {
        return this.request(`/api/admin/plants/${plantId}`, {
            method: 'DELETE'
        });
    }

    // --- 管理员专用 API (用户管理) ---

    async adminGetUsers(page = 1, pageSize = 20, search = '') {
        return this.request(`/api/admin/users?page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(search)}`, {
            method: 'GET'
        });
    }

    async adminUpdateUser(userId, data) {
        return this.request(`/api/admin/users/${userId}`, {
            method: 'PUT',
            body: data
        });
    }

    async adminResetUserPassword(userId, newPassword, notifyUser = false) {
        return this.request(`/api/admin/users/${userId}/password`, {
            method: 'POST',
            body: { newPassword, notifyUser: notifyUser === true }
        });
    }

    // 删除用户及其所有关联数据
    async adminDeleteUser(userId) {
        return this.request(`/api/admin/users/${userId}`, {
            method: 'DELETE'
        });
    }

    async adminBatchDelete(ids) {
        return this.request('/api/admin/plants/batch', {
            method: 'DELETE',
            body: { ids }
        });
    }

    async adminBatchImport(plants) {
        return this.request('/api/admin/plants/batch', {
            method: 'POST',
            body: plants
        });
    }

    async adminBatchImportPreview(plants) {
        return this.request('/api/admin/plants/batch/preview', {
            method: 'POST',
            body: plants
        });
    }

    // 辅助功能：生成演示数据
    async seedDemoData() {
        // 1. 确保有匿名账户
        if (!this.userId) {
            const identifyResult = await this.identify();
            if (!identifyResult.success || !identifyResult.userId) {
                throw new Error('无法初始化匿名账户');
            }
        }

        const samplePots = [
            {
                name: '示例：虎皮兰',
                note: '这是一款非常适合新手的植物，耐阴且净化空气。',
                plantDate: getLocalDateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)), // 30天前
                imageUrl: 'assets/images/demo/snake-plant.webp',
                plantType: '虎皮兰',
                careSchedules: [
                    { careType: 'water', intervalDays: 14 } // 每两周浇水一次
                ]
            },
            {
                name: '示例：薄荷',
                note: '放在窗台边，叶子可以用来泡茶。保持土壤湿润。',
                plantDate: getLocalDateString(new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)), // 15天前
                imageUrl: 'assets/images/demo/mint.webp',
                plantType: '薄荷',
                careSchedules: [
                    { careType: 'water', intervalDays: 3 } // 每3天浇水一次
                ]
            }
        ];

        const results = [];
        for (const potData of samplePots) {
            // 1. 生成 ID (必须在前端生成并传递)
            const potId = `pot_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

            // 2. 创建花盆
            const potPayload = {
                id: potId,
                userId: this.userId,
                name: potData.name,
                plantType: potData.plantType,
                note: potData.note,
                plantDate: potData.plantDate,
                imageUrl: potData.imageUrl
            };

            const potRes = await this.createPot(potPayload);
            if (potRes.success) {
                // 3. 创建养护计划
                if (potData.careSchedules) {
                    for (const schedule of potData.careSchedules) {
                        await this.createCareSchedule({
                            potId: potId,
                            careType: schedule.careType,
                            intervalDays: schedule.intervalDays,
                            enabled: 1
                        });
                    }
                }

                // 4. 创建初始养护记录
                // 浇水记录
                await this.createCareRecord({
                    potId: potId,
                    type: 'water',
                    action: '浇水',
                    description: '系统自动生成的初始记录',
                    careDate: potData.plantDate,
                    imageUrl: '' // 养护记录暂不带图
                });

                // 为薄荷额添加施肥记录
                if (potData.plantType === '薄荷') {
                    await this.createCareRecord({
                        potId: potId,
                        type: 'fertilize',
                        action: '施肥',
                        description: '补充生长所需养分',
                        careDate: getLocalDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
                        imageUrl: ''
                    });
                }

                // 5. 创建时间线记录 (种植日)
                await this.createTimeline({
                    potId: potId,
                    date: potData.plantDate,
                    description: '把植物带回家的第一天，希望它健康成长！',
                    images: JSON.stringify([potData.imageUrl])
                });

                results.push({ id: potId, ...potData });
            }
        }

        return { success: true, data: results };
    }
}

// API错误类
class APIError extends Error {
    constructor(status, message) {
        super(message);
        this.name = 'APIError';
        this.status = status;
    }
}

// 创建全局API客户端实例
const apiClient = new APIClient();

// 暴露到全局作用域
window.apiClient = apiClient;
window.APIClient = APIClient;
window.APIError = APIError;

// 控制台日志
