// 前端路由系统
class Router {
    constructor() {
        this.routes = [];
        this.currentRoute = null;
        this.currentParams = {};
        this.history = [];
        this.maxHistoryLength = 10;
        
        // 监听hash变化
        window.addEventListener('hashchange', () => this.handleHashChange());
        
        // 初始加载
        window.addEventListener('DOMContentLoaded', () => this.handleHashChange());
    }
    
    // 添加路由
    addRoute(path, component, name = null) {
        const route = {
            path,
            component,
            name: name || path,
            regex: this.pathToRegex(path)
        };
        
        this.routes.push(route);
        return this;
    }
    
    // 将路径转换为正则表达式
    pathToRegex(path) {
        const pattern = path
            .replace(/\//g, '\\/')
            .replace(/:(\w+)/g, '([^\\/]+)')
            .replace(/\*/g, '.*');
        
        return new RegExp(`^${pattern}$`);
    }
    
    // 处理hash变化
    handleHashChange() {
        const hash = window.location.hash.slice(1) || '/';
        this.navigateTo(hash, false); // false表示不添加历史记录
    }
    
    // 导航到指定路径
    navigateTo(path, addToHistory = true) {
        // 如果路径不是以/开头，添加/
        if (!path.startsWith('/')) {
            path = '/' + path;
        }
        
        // 查找匹配的路由
        const route = this.findRoute(path);
        
        if (route) {
            // 提取参数
            const params = this.extractParams(route, path);
            
            // 更新当前路由
            this.currentRoute = route;
            this.currentParams = params;
            
            // 添加到历史记录
            if (addToHistory) {
                this.addToHistory(path);
            }
            
            // 更新URL hash（如果不同）
            if (window.location.hash.slice(1) !== path) {
                window.location.hash = path;
            }
            
            // 执行路由组件
            if (route.component) {
                route.component(params);
            }
            
            // 触发路由变化事件
            this.triggerRouteChange(route, params);
            
            return true;
        }
        
        console.warn(`Route not found: ${path}`);
        return false;
    }
    
    // 查找匹配的路由
    findRoute(path) {
        // 首先尝试精确匹配
        for (const route of this.routes) {
            if (route.regex.test(path)) {
                return route;
            }
        }
        
        // 如果没有匹配的路由，返回首页
        return this.routes.find(r => r.path === '/') || null;
    }
    
    // 从路径中提取参数
    extractParams(route, path) {
        const params = {};
        const match = path.match(route.regex);
        
        if (match) {
            // 提取命名参数
            const paramNames = this.getParamNames(route.path);
            paramNames.forEach((name, index) => {
                params[name] = match[index + 1];
            });
        }
        
        return params;
    }
    
    // 获取路径中的参数名
    getParamNames(path) {
        const paramNames = [];
        const paramPattern = /:(\w+)/g;
        let match;
        
        while ((match = paramPattern.exec(path)) !== null) {
            paramNames.push(match[1]);
        }
        
        return paramNames;
    }
    
    // 添加到历史记录
    addToHistory(path) {
        this.history.push({
            path,
            timestamp: Date.now()
        });
        
        // 限制历史记录长度
        if (this.history.length > this.maxHistoryLength) {
            this.history.shift();
        }
    }
    
    // 返回上一页
    goBack() {
        if (this.history.length > 1) {
            this.history.pop(); // 移除当前页
            const previous = this.history.pop(); // 获取上一页
            if (previous) {
                this.navigateTo(previous.path, false);
            }
        } else {
            this.navigateTo('/', false);
        }
    }
    
    // 获取当前路由信息
    getCurrentRoute() {
        return {
            route: this.currentRoute,
            params: this.currentParams,
            fullPath: window.location.hash.slice(1) || '/'
        };
    }
    
    // 触发路由变化事件
    triggerRouteChange(route, params) {
        const event = new CustomEvent('routechange', {
            detail: {
                route,
                params,
                timestamp: Date.now()
            }
        });
        
        window.dispatchEvent(event);
    }
    
    // 获取路由URL
    getRouteUrl(name, params = {}) {
        const route = this.routes.find(r => r.name === name);
        
        if (!route) {
            console.warn(`Route not found: ${name}`);
            return '#/';
        }
        
        let url = route.path;
        
        // 替换参数
        for (const [key, value] of Object.entries(params)) {
            url = url.replace(`:${key}`, value);
        }
        
        return `#${url}`;
    }
    
    // 初始化默认路由
    initDefaultRoutes() {
        // 首页
        this.addRoute('/', () => {}, 'home');
        
        // 登录页
        this.addRoute('/login', () => {}, 'login');
        
        // 注册页
        this.addRoute('/register', () => {}, 'register');
        
        // 花盆详情页
        this.addRoute('/pots/:id', (params) => {}, 'pot-detail');
        
        // 添加花盆页
        this.addRoute('/add-pot', () => {}, 'add-pot');
        
        // 编辑花盆页
        this.addRoute('/pots/:id/edit', (params) => {}, 'edit-pot');
        
        // 404页面
        this.addRoute('*', () => {}, 'not-found');
    }
}

// 创建全局路由实例
const router = new Router();

// 初始化默认路由
router.initDefaultRoutes();

// 暴露到全局作用域
window.router = router;
window.Router = Router;
