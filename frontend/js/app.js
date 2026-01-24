// My Flower Pots App - 主应用逻辑
// 基于原小程序功能重构

// 等待Alpine.js初始化
document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => ({
        // 应用状态
        isLoading: true,
        error: null,
        isLoggedIn: false,
        user: {}, // 改为空对象而非null
        
        // 数据状态
        pots: [],
        weatherData: {}, // 改为空对象而非null
        careAdvice: [],
        currentSeason: '',
        
        // UI状态
        showLoginModal: false,
        showRegisterModal: false,
        showUserMenu: false,
        showAdviceModal: false,
        isBatchMode: false,
        batchClickCount: 0,
        selectedCount: 0,
        currentAdviceIndex: 0,
        
        // 表单数据
        loginForm: {
            email: '',
            password: ''
        },
        registerForm: {
            email: '',
            password: '',
            confirmPassword: '',
            displayName: ''
        },
        
        // 加载状态
        isLoggingIn: false,
        isRegistering: false,
        isLoadingWeather: false,
        
        // 时间戳
        lastWeatherRequestTime: 0,
        
        // 初始化应用
        async init() {
            try {
                // 检查用户登录状态
                await this.checkAuth();
                
                // 加载花盆列表
                if (this.isLoggedIn) {
                    await this.loadPots();
                }
                
                // 加载天气和养护建议
                await this.loadWeatherAndAdvice();
                
                // 启动养护建议轮播
                this.startAdviceCarousel();
                
            } catch (error) {
                this.showError('应用初始化失败: ' + error.message);
            } finally {
                this.isLoading = false;
            }
        },
        
        // 检查认证状态
        async checkAuth() {
            try {
                const token = localStorage.getItem('flowerpots_token');
                const userId = localStorage.getItem('flowerpots_user_id');
                
                // 检查 apiClient 是否已初始化
                if (typeof apiClient === 'undefined') {
                    console.warn('apiClient 未初始化，等待重试...');
                    this.isLoggedIn = false;
                    this.user = null;
                    return;
                }
                
                if (token && userId) {
                    // 设置API客户端token
                    apiClient.setToken(token, userId);
                    
                    // 尝试获取当前用户信息
                    try {
                        const userData = await apiClient.getCurrentUser();
                        this.user = userData.user || {};
                        this.isLoggedIn = true;
                    } catch (error) {
                        console.warn('获取用户信息失败:', error);
                        
                        // 如果是401错误，清除无效的token并重试匿名标识
                        if (error.status === 401) {
                            localStorage.removeItem('flowerpots_token');
                            localStorage.removeItem('flowerpots_user_id');
                            apiClient.clearAuth();
                            
                            // 重试匿名标识
                            try {
                                const identifyResult = await apiClient.identify();
                                apiClient.setToken(identifyResult.token, identifyResult.userId);
                                this.isLoggedIn = false;
                                this.user = { userType: 'anonymous' };
                            } catch (identifyError) {
                                console.warn('匿名标识重试失败:', identifyError);
                                this.isLoggedIn = false;
                                this.user = {};
                            }
                        } else {
                            // 其他错误，保持匿名状态
                            this.isLoggedIn = false;
                            this.user = {};
                        }
                    }
                } else {
                    // 匿名用户标识
                    try {
                        const identifyResult = await apiClient.identify();
                        apiClient.setToken(identifyResult.token, identifyResult.userId);
                        this.isLoggedIn = false;
                        this.user = { userType: 'anonymous' };
                    } catch (error) {
                        console.warn('匿名标识失败:', error);
                        this.isLoggedIn = false;
                        this.user = {};
                    }
                }
            } catch (error) {
                console.warn('认证检查失败:', error);
                this.isLoggedIn = false;
                this.user = {};
            }
            
            // 双重保障：确保user和weatherData不为null
            if (!this.user || typeof this.user !== 'object') {
                this.user = {};
            }
            if (!this.weatherData || typeof this.weatherData !== 'object') {
                this.weatherData = {};
            }
        },
        
        // 加载花盆列表
        async loadPots() {
            if (!this.isLoggedIn) {
                return;
            }
            
            try {
                this.isLoading = true;
                const potsData = await apiClient.getPots();
                
                // 添加滑动状态和选择状态
                this.pots = potsData.map(pot => ({
                    ...pot,
                    swipeX: 0,
                    checked: false
                }));
            } catch (error) {
                this.showError('加载花盆失败: ' + error.message);
                this.pots = [];
            } finally {
                this.isLoading = false;
            }
        },
        
        // 加载天气和养护建议（简化版，因为相关API尚未实现）
        async loadWeatherAndAdvice() {
            // 控制天气请求频率（最多每30分钟请求一次）
            const now = Date.now();
            if (now - this.lastWeatherRequestTime < 30 * 60 * 1000) {
                return;
            }
            
            try {
                this.isLoadingWeather = true;
                
                // 注意：天气和养护建议API尚未实现，使用默认数据
                // 避免调用不存在的API端点
                this.weatherData = {
                    location: { fullName: '本地' },
                    current: { temp: '25°C', condition: '晴朗', humidity: '60%' }
                };
                
                // 生成简单的养护建议
                this.careAdvice = [
                    '今天天气晴朗，适合给植物浇水',
                    '保持土壤湿润，但不要过湿',
                    '注意观察植物生长状态'
                ];
                
                this.currentSeason = '春季';
                this.lastWeatherRequestTime = now;
            } catch (error) {
                console.error('加载天气或养护建议失败:', error);
                // 不显示错误，使用默认数据
                this.weatherData = {
                    location: { fullName: '本地' },
                    current: { temp: '--', condition: '未知', humidity: '--' }
                };
                this.careAdvice = [];
            } finally {
                this.isLoadingWeather = false;
            }
        },
        
        // 启动养护建议轮播
        startAdviceCarousel() {
            if (this.careAdvice.length <= 1) return;
            
            setInterval(() => {
                this.currentAdviceIndex = (this.currentAdviceIndex + 1) % this.careAdvice.length;
            }, 3000);
        },
        
        // 用户登录
        async login() {
            try {
                this.isLoggingIn = true;
                this.error = null;
                
                const result = await apiClient.login(
                    this.loginForm.email,
                    this.loginForm.password
                );
                
                this.user = {
                    id: result.userId,
                    email: result.email,
                    displayName: result.displayName,
                    emailVerified: result.emailVerified
                };
                
                this.isLoggedIn = true;
                this.showLoginModal = false;
                
                // 重置表单
                this.loginForm = { email: '', password: '' };
                
                // 加载用户数据
                await this.loadPots();
                await this.loadWeatherAndAdvice();
                
            } catch (error) {
                this.showError('登录失败: ' + error.message);
            } finally {
                this.isLoggingIn = false;
            }
        },
        
        // 用户注册
        async register() {
            // 验证密码是否匹配
            if (this.registerForm.password !== this.registerForm.confirmPassword) {
                this.showError('两次输入的密码不一致');
                return;
            }
            
            // 验证密码强度
            if (this.registerForm.password.length < 8) {
                this.showError('密码长度至少8位');
                return;
            }
            
            // 验证密码包含字母和数字
            const hasLetter = /[a-zA-Z]/.test(this.registerForm.password);
            const hasNumber = /\d/.test(this.registerForm.password);
            if (!hasLetter || !hasNumber) {
                this.showError('密码必须包含字母和数字');
                return;
            }
            
            try {
                this.isRegistering = true;
                this.error = null;
                
                const result = await apiClient.register(
                    this.registerForm.email,
                    this.registerForm.password,
                    this.registerForm.displayName
                );
                
                this.user = {
                    id: result.userId,
                    email: result.email,
                    displayName: result.displayName,
                    emailVerified: result.emailVerified
                };
                
                this.isLoggedIn = true;
                this.showRegisterModal = false;
                
                // 重置表单
                this.registerForm = { email: '', password: '', confirmPassword: '', displayName: '' };
                
            } catch (error) {
                this.showError('注册失败: ' + error.message);
            } finally {
                this.isRegistering = false;
            }
        },
        
        // 用户退出
        async logout() {
            try {
                await apiClient.logout();
                this.isLoggedIn = false;
                this.user = null;
                this.pots = [];
                this.showUserMenu = false;
                
                // 重新进行匿名标识
                await this.checkAuth();
            } catch (error) {
                this.showError('退出失败: ' + error.message);
            }
        },
        
        // 编辑资料
        editProfile() {
            alert('修改资料功能开发中...');
            this.showUserMenu = false;
        },
        
        // 切换批量选择模式
        toggleBatchMode() {
            this.batchClickCount++;
            
            if (this.batchClickCount === 1) {
                // 第一次点击：进入批量选择模式
                this.isBatchMode = true;
            } else if (this.batchClickCount === 2) {
                // 第二次点击：全选所有花盆
                this.pots = this.pots.map(pot => ({ ...pot, checked: true }));
                this.selectedCount = this.pots.length;
            } else if (this.batchClickCount === 3) {
                // 第三次点击：取消全选
                this.pots = this.pots.map(pot => ({ ...pot, checked: false }));
                this.selectedCount = 0;
                this.batchClickCount = 1; // 重置为1，保持批量选择模式
            }
        },
        
        // 取消批量选择模式
        cancelBatchMode() {
            this.pots = this.pots.map(pot => ({ ...pot, checked: false }));
            this.isBatchMode = false;
            this.selectedCount = 0;
            this.batchClickCount = 0;
        },
        
        // 切换勾选框
        toggleCheckbox(index) {
            this.pots[index].checked = !this.pots[index].checked;
            this.selectedCount = this.pots.filter(pot => pot.checked).length;
        },
        
        // 删除花盆
        async deletePot(potId, index) {
            if (!confirm('确定要删除这个花盆吗？此操作不可撤销。')) {
                return;
            }
            
            try {
                this.isLoading = true;
                await apiClient.deletePot(potId);
                
                // 从本地数据中移除
                this.pots.splice(index, 1);
                this.selectedCount = this.pots.filter(pot => pot.checked).length;
                
            } catch (error) {
                this.showError('删除花盆失败: ' + error.message);
            } finally {
                this.isLoading = false;
            }
        },
        
        // 删除选中的花盆
        async deleteSelectedPots() {
            const selectedPots = this.pots.filter(pot => pot.checked);
            if (selectedPots.length === 0) {
                this.showError('请先选择要删除的花盆');
                return;
            }

            if (!confirm(`确定要删除选中的 ${selectedPots.length} 个花盆吗？此操作不可恢复。`)) {
                return;
            }

            try {
                this.isLoading = true;
                
                // 批量删除
                const deletePromises = selectedPots.map(pot => 
                    apiClient.deletePot(pot.id).catch(err => {
                        console.error(`删除花盆 ${pot.id} 失败:`, err);
                        return null;
                    })
                );

                await Promise.all(deletePromises);
                
                // 从本地数据中移除已删除的花盆
                this.pots = this.pots.filter(pot => !pot.checked);
                
                // 如果删除了所有花盆，自动退出批量模式
                if (this.pots.length === 0) {
                    this.isBatchMode = false;
                }
                
                this.selectedCount = 0;
                this.batchClickCount = 0;
            } catch (error) {
                this.showError('批量删除花盆失败: ' + error.message);
            } finally {
                this.isLoading = false;
            }
        },
        
        // 查看花盆详情
        goPotDetail(potId) {
            if (this.isBatchMode) return;
            
            window.location.href = `pot-detail.html?id=${potId}`;
        },
        
        // 添加花盆
        goAddPot() {
            window.location.href = 'add-pot.html';
        },
        
        // 显示错误信息
        showError(message) {
            this.error = message;
            console.error('App错误:', message);
            
            // 5秒后自动清除错误
            setTimeout(() => {
                if (this.error === message) {
                    this.error = null;
                }
            }, 5000);
        },
        
        // 格式化日期
        formatDate(dateString) {
            if (!dateString) return '未设置';
            
            try {
                const date = new Date(dateString);
                return date.toLocaleDateString('zh-CN', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
            } catch {
                return dateString;
            }
        },
        
        // 滑动删除相关函数（由HTML中的脚本处理）
        startSwipe(index, event) {
            // 由HTML中的脚本处理
        },
        
        moveSwipe(index, event) {
            // 由HTML中的脚本处理
        },
        
        endSwipe(index) {
            // 由HTML中的脚本处理
        }
    }));
});

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    // 检查Alpine.js是否已加载
    if (typeof Alpine === 'undefined') {
        console.error('Alpine.js未加载！');
        return;
    }
});
