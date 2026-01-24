-- ============================================
-- My Flower Pots - 统一数据库架构脚本
-- ============================================

PRAGMA defer_foreign_keys=TRUE;

-- 1. 用户表 (包含核心认证、邮箱验证及更改逻辑)
CREATE TABLE users (
    id TEXT PRIMARY KEY,                 -- openid / 设备 ID
    user_type TEXT NOT NULL,             -- wechat / device
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- 核心账号信息
    email TEXT,
    password_hash TEXT,
    display_name TEXT,
    avatar_url TEXT,
    
    -- 认证状态
    email_verified BOOLEAN DEFAULT FALSE,
    verification_token TEXT,
    reset_token TEXT,
    reset_token_expires DATETIME,
    last_login DATETIME,
    
    -- 邮箱更改流程字段
    new_email TEXT,
    new_email_verification_token TEXT,
    new_email_verification_expires DATETIME
);

-- 2. 花盆基本信息表
CREATE TABLE pots (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    plant_type TEXT,
    note TEXT,
    plant_date TEXT,
    image_url TEXT,
    last_care TEXT,
    last_care_action TEXT,
    
    -- 排序字段
    sort_order REAL DEFAULT 0,
    
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 3. 养护记录表 (精简后的业务表)
CREATE TABLE care_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pot_id TEXT NOT NULL,
    type TEXT NOT NULL,                  -- water / fertilize / custom
    action TEXT NOT NULL,
    care_date TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    created_at TEXT,
    FOREIGN KEY (pot_id) REFERENCES pots(id) ON DELETE CASCADE
);

-- 4. 生长轨迹（时间轴）表
CREATE TABLE timelines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pot_id TEXT NOT NULL,
    date TEXT NOT NULL,
    description TEXT,
    images TEXT,                         -- 存储为 JSON 字符串
    video TEXT,
    created_at TEXT,
    FOREIGN KEY (pot_id) REFERENCES pots(id) ON DELETE CASCADE
);

-- 5. 植物百科参考数据表
CREATE TABLE IF NOT EXISTS plants (
    id TEXT PRIMARY KEY,                -- 如 'YueJi'
    name TEXT NOT NULL,                 -- 如 '月季'
    category TEXT,
    care_difficulty TEXT,
    basic_info TEXT,                   -- JSON 存储
    ornamental_features TEXT,          -- JSON 存储
    care_guide TEXT,                   -- JSON 存储
    image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. 植物别名关联表
CREATE TABLE IF NOT EXISTS plant_synonyms (
    plant_id TEXT NOT NULL,
    synonym TEXT NOT NULL,
    FOREIGN KEY (plant_id) REFERENCES plants(id) ON DELETE CASCADE,
    PRIMARY KEY (plant_id, synonym)
);

-- ============================================
-- 索引优化
-- ============================================

-- 用户索引
CREATE INDEX idx_users_user_type ON users(user_type);
CREATE UNIQUE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_verification_token ON users(verification_token);
CREATE INDEX idx_users_reset_token ON users(reset_token);
CREATE INDEX idx_users_new_email_token ON users(new_email_verification_token);

-- 业务索引
CREATE INDEX idx_pots_user_id ON pots(user_id);
CREATE INDEX idx_care_records_pot ON care_records(pot_id);
CREATE INDEX idx_timelines_pot ON timelines(pot_id);

-- 百科索引
CREATE INDEX IF NOT EXISTS idx_plants_name ON plants(name);
CREATE INDEX IF NOT EXISTS idx_plants_category ON plants(category);
CREATE INDEX IF NOT EXISTS idx_synonyms_name ON plant_synonyms(synonym);
