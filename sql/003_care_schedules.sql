-- 养护提醒计划表
-- 用于存储用户为每个花盆设置的养护周期

CREATE TABLE IF NOT EXISTS care_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pot_id TEXT NOT NULL,
    care_type TEXT NOT NULL,          -- 'water' | 'fertilize' | 'custom'
    interval_days INTEGER NOT NULL,   -- 周期天数
    custom_action TEXT,               -- 自定义动作名称 (仅 care_type='custom' 时使用)
    enabled INTEGER DEFAULT 1,        -- 是否启用 (SQLite 无 BOOLEAN)
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (pot_id) REFERENCES pots(id) ON DELETE CASCADE
);

-- 索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_care_schedules_pot ON care_schedules(pot_id);
CREATE INDEX IF NOT EXISTS idx_care_schedules_enabled ON care_schedules(enabled);
