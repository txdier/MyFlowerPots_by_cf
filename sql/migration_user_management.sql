-- Migration: Add user management fields
-- Add max_pots for custom limits (NULL means use system default)
-- Add is_disabled for account banning (0 = active, 1 = disabled)

-- 检查并添加 max_pots 字段
ALTER TABLE users ADD COLUMN max_pots INTEGER DEFAULT NULL;

-- 检查并添加 is_disabled 字段
ALTER TABLE users ADD COLUMN is_disabled INTEGER DEFAULT 0;
