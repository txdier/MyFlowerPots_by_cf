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
        const legacyToken = safeStorageGet(window.localStorage, AUTH_KEYS.token);
        const legacyUserId = safeStorageGet(window.localStorage, AUTH_KEYS.userId);
        const sessionToken = safeStorageGet(window.sessionStorage, AUTH_KEYS.token);
        const sessionUserId = safeStorageGet(window.sessionStorage, AUTH_KEYS.userId);

        if (!sessionToken && !sessionUserId && legacyToken && legacyUserId) {
            safeStorageSet(window.sessionStorage, AUTH_KEYS.token, legacyToken);
            safeStorageSet(window.sessionStorage, AUTH_KEYS.userId, legacyUserId);
        }

        safeStorageRemove(window.localStorage, AUTH_KEYS.token);
        safeStorageRemove(window.localStorage, AUTH_KEYS.userId);
    },

    getToken() {
        return safeStorageGet(window.sessionStorage, AUTH_KEYS.token);
    },

    getUserId() {
        return safeStorageGet(window.sessionStorage, AUTH_KEYS.userId);
    },

    setAuth(token, userId) {
        if (token && userId) {
            safeStorageSet(window.sessionStorage, AUTH_KEYS.token, token);
            safeStorageSet(window.sessionStorage, AUTH_KEYS.userId, userId);
        } else {
            this.clear();
            return;
        }

        safeStorageRemove(window.localStorage, AUTH_KEYS.token);
        safeStorageRemove(window.localStorage, AUTH_KEYS.userId);
    },

    clear() {
        safeStorageRemove(window.sessionStorage, AUTH_KEYS.token);
        safeStorageRemove(window.sessionStorage, AUTH_KEYS.userId);
        safeStorageRemove(window.localStorage, AUTH_KEYS.token);
        safeStorageRemove(window.localStorage, AUTH_KEYS.userId);
    }
};

AUTH_STORAGE.migrateLegacy();
window.authStorage = AUTH_STORAGE;

const emitAuthExpired = (message = '登录已过期，请重新登录') => {
    window.dispatchEvent(new CustomEvent('auth:expired', {
        detail: { message }
    }));
};

const PUBLIC_AUTH_ENDPOINTS = new Set([
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/identify',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
]);

// API客户端类
class APIClient {
    constructor(config = {}) {
        this.config = { ...API_CONFIG, ...config };
        this.token = AUTH_STORAGE.getToken();
        this.userId = AUTH_STORAGE.getUserId();
        if (this.token && !this.userId) {
            this.clearAuth();
        }
    }

    // 设置认证令牌
    setToken(token, userId) {
        this.token = token || null;
        this.userId = userId || null;
        AUTH_STORAGE.setAuth(this.token, this.userId);
    }

    // 清除认证信息
    clearAuth() {
        this.token = null;
        this.userId = null;
        AUTH_STORAGE.clear();
    }

    // 刷新 JWT 令牌（使用当前已认证会话续签）
    // 使用锁机制防止并发刷新
    _refreshPromise = null;

    async refreshToken() {
        // 如果已有刷新操作在进行，等待它完成
        if (this._refreshPromise) {
            console.log('Token refresh already in progress, waiting...');
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
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({})
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success && data.token) {
                    this.setToken(data.token, data.userId);
                    console.log('Token refreshed successfully');
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
        const shouldSendAuth = !!(this.token && !PUBLIC_AUTH_ENDPOINTS.has(endpoint));

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

        const url = `${this.config.baseUrl}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...(shouldSendAuth && { 'Authorization': `Bearer ${this.token}` }),
            ...options.headers,
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        try {
            const response = await fetch(url, {
                method: options.method || 'GET',
                headers,
                body: options.body ? JSON.stringify(options.body) : undefined,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                let errorData;
                try {
                    errorData = JSON.parse(errorText);
                } catch {
                    errorData = { error: errorText || `HTTP ${response.status}` };
                }

                // 处理 401 未授权：JWT 令牌过期或无效
                if (response.status === 401) {
                    const canRefresh = endpoint !== '/api/auth/refresh' && !!(this.token && this.userId && !this.isTokenExpired());
                    if (canRefresh) {
                        console.warn('Token expired or invalid, attempting refresh...');
                        const refreshed = await this.refreshToken();
                        if (refreshed) {
                            console.log('Token refreshed, retrying request...');
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

            const data = await response.json();
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

    // 用户认证API
    async identify() {
        const result = await this.request('/api/auth/identify', { method: 'POST' });
        if (result.success && result.userId) {
            this.setToken(result.token, result.userId);
        }
        return result;
    }

    async login(email, password) {
        const result = await this.request('/api/auth/login', {
            method: 'POST',
            body: { email, password }
        });

        if (result.token && result.userId) {
            this.setToken(result.token, result.userId);
        }

        return result;
    }

    async register(email, password, displayName) {
        const result = await this.request('/api/auth/register', {
            method: 'POST',
            body: { email, password, displayName }
        });

        if (result.token && result.userId) {
            this.setToken(result.token, result.userId);
        }

        return result;
    }

    async upgrade(email, password, displayName, anonymousUserId) {
        const result = await this.request('/api/auth/upgrade', {
            method: 'POST',
            body: { email, password, displayName, anonymousUserId }
        });

        if (result.token && result.userId) {
            this.setToken(result.token, result.userId);
        }

        return result;
    }

    async getCurrentUser() {
        return this.request('/api/auth/me');
    }

    async getUserProfile() {
        return this.getCurrentUser();
    }

    async logout() {
        this.clearAuth();
        return { success: true };
    }

    async forgotPassword(email) {
        return this.request('/api/auth/forgot-password', {
            method: 'POST',
            body: { email }
        });
    }

    async resetPassword(token, newPassword) {
        return this.request('/api/auth/reset-password', {
            method: 'POST',
            body: { token, newPassword }
        });
    }

    // 花盆管理API
    async getPots(userId = this.userId) {
        // 优化：如果没有用户ID（未登录且未创建匿名账户），直接返回空数组，避免无效API调用
        if (!userId) {
            return { success: true, data: [] };
        }
        return this.request('/api/pots');
    }

    async getPotDetail(potId) {
        return this.request(`/api/pots/${potId}`);
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

    async getPublicPotDetail(token) {
        return this.request(`/api/public/pots/${token}`);
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
    async getTimelines(potId) {
        return this.request(`/api/pots/${potId}/timelines`);
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
    async smartMatchPlant(potName, potNote = '') {
        return this.request('/api/plants/smart-match', {
            method: 'POST',
            body: { potName, potNote }
        });
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

    async adminGetPlants(page = 1, pageSize = 20, search = '') {
        return this.request(`/api/admin/plants?page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(search)}`);
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
                plantDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30天前
                imageUrl: 'assets/images/demo/snake-plant.png',
                plantType: '虎皮兰',
                careSchedules: [
                    { careType: 'water', intervalDays: 14 } // 每两周浇水一次
                ]
            },
            {
                name: '示例：薄荷',
                note: '放在窗台边，叶子可以用来泡茶。保持土壤湿润。',
                plantDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 15天前
                imageUrl: 'assets/images/demo/mint.png',
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
                        careDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
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
// console.log('API客户端已加载，baseUrl:', apiClient.config.baseUrl);
