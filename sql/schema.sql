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
    verification_token_expires DATETIME,
    reset_token TEXT,
    reset_token_expires DATETIME,
    last_login DATETIME,
    
    -- 邮箱更改流程字段
    new_email TEXT,
    new_email_verification_token TEXT,
    new_email_verification_expires DATETIME,
    
    -- 管理功能
    max_pots INTEGER DEFAULT NULL,
    is_disabled INTEGER DEFAULT 0
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
    
    -- 分享与转移字段
    share_token TEXT UNIQUE,             -- 分享令牌
    is_shared INTEGER DEFAULT 0,         -- 是否开启分享
    show_comment_danmaku INTEGER DEFAULT 1, -- 是否显示留言弹幕
    transfer_token TEXT UNIQUE,          -- 转移令牌
    transfer_expires_at DATETIME,        -- 转移过期时间
    transfer_target_email TEXT,          -- 转移目标邮箱
    
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
    user_id TEXT,                        -- 操作人ID
    FOREIGN KEY (pot_id) REFERENCES pots(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
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
    user_id TEXT,                        -- 操作人ID
    FOREIGN KEY (pot_id) REFERENCES pots(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
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

-- 7. 养护提醒计划表
CREATE TABLE IF NOT EXISTS care_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pot_id TEXT NOT NULL,
    care_type TEXT NOT NULL,          -- 'water' | 'fertilize' | 'custom'
    interval_days INTEGER NOT NULL,   -- 周期天数
    custom_action TEXT,               -- 自定义动作名称 (仅 care_type='custom' 时使用)
    enabled INTEGER DEFAULT 1,        -- 是否启用 (SQLite 无 BOOLEAN)
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- 8. 花盆协作者表
CREATE TABLE IF NOT EXISTS pot_collaborators (
    pot_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'collaborator',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (pot_id, user_id),
    FOREIGN KEY (pot_id) REFERENCES pots(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS pot_viewers (
    pot_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (pot_id, user_id),
    FOREIGN KEY (pot_id) REFERENCES pots(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS pot_collab_invites (
    id TEXT PRIMARY KEY,
    pot_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    revoked_at TEXT,
    max_views INTEGER DEFAULT 5,
    view_count INTEGER DEFAULT 0,
    claim_session_id TEXT,
    claimed_by_user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pot_id) REFERENCES pots(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (claimed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS pot_view_invites (
    id TEXT PRIMARY KEY,
    pot_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    revoked_at TEXT,
    max_views INTEGER DEFAULT 5,
    view_count INTEGER DEFAULT 0,
    claim_session_id TEXT,
    claimed_by_user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pot_id) REFERENCES pots(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (claimed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS pot_batch_invites (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    permission_type TEXT NOT NULL,
    pot_ids_json TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    revoked_at TEXT,
    max_views INTEGER DEFAULT 5,
    view_count INTEGER DEFAULT 0,
    claim_session_id TEXT,
    claimed_by_user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (claimed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
-- 9. 页面访问统计表（累计）
CREATE TABLE IF NOT EXISTS page_visits (
    path TEXT PRIMARY KEY,
    visit_count INTEGER DEFAULT 0,
    last_updated DATETIME
);

-- 10. 消息中心表
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,         -- 接收者 ID (关联 users.id)
    sender_id TEXT,                -- 发送者 ID (关联 users.id, 可选)
    type TEXT NOT NULL,            -- 消息类型: 'transfer_request', 'collab_invite', 'system_info'
    status TEXT DEFAULT 'unread',  -- 状态: 'unread' (未读), 'read' (已读), 'processed' (已处理)
    title TEXT NOT NULL,           -- 消息展示标题
    content TEXT,                  -- 消息正文 (支持 HTML 或纯文本)
    related_id TEXT,               -- 相关业务 ID (如 pot_id)
    extra_data TEXT,               -- 附加数据 (JSON 对象, 存储 token 等)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 9. 页面访问统计表（按日期）
CREATE TABLE IF NOT EXISTS page_visits_daily (
    path TEXT NOT NULL,
    visit_date TEXT NOT NULL,
    visit_count INTEGER DEFAULT 0,
    PRIMARY KEY (path, visit_date)
);

-- 11. 支持邮件主表
CREATE TABLE IF NOT EXISTS support_emails (
  id          TEXT PRIMARY KEY,
  from_addr   TEXT NOT NULL,
  to_addr     TEXT NOT NULL,
  subject     TEXT NOT NULL,
  text_body   TEXT NOT NULL,
  html_body   TEXT,
  attachments TEXT,
  received_at TEXT NOT NULL,
  read        INTEGER NOT NULL DEFAULT 0,
  replied     INTEGER NOT NULL DEFAULT 0
);

-- 12. 支持邮件回复记录表
CREATE TABLE IF NOT EXISTS support_replies (
  id       TEXT PRIMARY KEY,
  email_id TEXT NOT NULL REFERENCES support_emails(id) ON DELETE CASCADE,
  body     TEXT NOT NULL,
  sent_at  TEXT NOT NULL
);

-- 13. 花盆留言表
CREATE TABLE IF NOT EXISTS pot_comments (
    id TEXT PRIMARY KEY,
    pot_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    parent_comment_id TEXT,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pot_id) REFERENCES pots(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_comment_id) REFERENCES pot_comments(id) ON DELETE CASCADE
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
CREATE INDEX idx_care_records_user ON care_records(user_id);
CREATE INDEX idx_timelines_pot ON timelines(pot_id);
CREATE INDEX idx_timelines_user ON timelines(user_id);

-- 百科索引
CREATE INDEX IF NOT EXISTS idx_plants_name ON plants(name);
CREATE INDEX IF NOT EXISTS idx_plants_category ON plants(category);
CREATE INDEX IF NOT EXISTS idx_synonyms_name ON plant_synonyms(synonym);

CREATE INDEX IF NOT EXISTS idx_care_schedules_pot ON care_schedules(pot_id);
CREATE INDEX IF NOT EXISTS idx_care_schedules_enabled ON care_schedules(enabled);

-- 协作索引
CREATE INDEX IF NOT EXISTS idx_collaborators_user ON pot_collaborators(user_id);
CREATE INDEX IF NOT EXISTS idx_collaborators_pot ON pot_collaborators(pot_id);
CREATE INDEX IF NOT EXISTS idx_viewers_user ON pot_viewers(user_id);
CREATE INDEX IF NOT EXISTS idx_viewers_pot ON pot_viewers(pot_id);
CREATE INDEX IF NOT EXISTS idx_collab_invites_pot ON pot_collab_invites(pot_id);
CREATE INDEX IF NOT EXISTS idx_collab_invites_token ON pot_collab_invites(token);
CREATE INDEX IF NOT EXISTS idx_pot_batch_invites_owner ON pot_batch_invites(owner_id);
CREATE INDEX IF NOT EXISTS idx_pot_batch_invites_token ON pot_batch_invites(token);
CREATE INDEX IF NOT EXISTS idx_view_invites_pot ON pot_view_invites(pot_id);
CREATE INDEX IF NOT EXISTS idx_view_invites_token ON pot_view_invites(token);
CREATE INDEX IF NOT EXISTS idx_pot_comments_pot ON pot_comments(pot_id);
CREATE INDEX IF NOT EXISTS idx_pot_comments_parent ON pot_comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_pot_comments_created ON pot_comments(created_at);

-- 统计索引
CREATE INDEX IF NOT EXISTS idx_page_visits_daily_date ON page_visits_daily(visit_date);

-- 消息索引
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);

-- 支持邮件索引
CREATE INDEX IF NOT EXISTS idx_support_emails_received ON support_emails(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_emails_read     ON support_emails(read);
CREATE INDEX IF NOT EXISTS idx_support_replies_email   ON support_replies(email_id);
