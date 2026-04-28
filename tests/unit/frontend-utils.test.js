import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

function loadBrowserUtility(file, exportName) {
  const context = {
    console,
    Date,
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(file, 'utf8'), context, { filename: file });
  return context[exportName];
}

describe('frontend shared utilities', () => {
  const dateUtils = loadBrowserUtility('frontend/js/date-utils.js', 'MyFlowerPotsDate');
  const careUtils = loadBrowserUtility('frontend/js/care-utils.js', 'MyFlowerPotsCare');
  const formUtils = loadBrowserUtility('frontend/js/form-utils.js', 'MyFlowerPotsFormUtils');
  const permissionUtils = loadBrowserUtility('frontend/js/pot-permissions.js', 'MyFlowerPotsPotPermissions');

  it('formats growth duration with exact days when requested', () => {
    expect(dateUtils.formatGrowthDuration(
      { plant_date: '2026-04-28' },
      '无',
      { fallbackEnd: '2026-04-28' }
    )).toBe('第 1 天');
    expect(dateUtils.formatGrowthDuration(
      { plant_date: '2026-01-27' },
      '无',
      { fallbackEnd: '2026-04-28', includeExactDays: true }
    )).toBe('约 3 个月（共 92 天）');
    expect(dateUtils.formatGrowthDuration(
      { plant_date: '2025-01-27' },
      '无',
      { fallbackEnd: '2026-05-28', includeExactDays: true }
    )).toBe('1 年 4 个月（共 487 天）');
  });

  it('stops growth duration at archived_at for archived pots', () => {
    expect(dateUtils.formatGrowthDuration(
      { plant_date: '2024-01-01', status: 'archived', archived_at: '2024-04-01' },
      '无',
      { fallbackEnd: '2026-04-28', includeExactDays: true }
    )).toBe('约 3 个月（共 92 天）');
  });

  it('normalizes care type aliases and Chinese actions', () => {
    expect(careUtils.normalizeCareType('watering')).toBe('water');
    expect(careUtils.normalizeCareType('', '翻盆检查')).toBe('repot');
    expect(careUtils.getCareTypeLabel('custom', '擦叶')).toBe('擦叶');
  });

  it('limits display names by visual width', () => {
    expect(formUtils.limitTextDisplayWidth('abcd中文', 4)).toBe('abcd中文');
    expect(formUtils.limitTextDisplayWidth('abcdefgh中', 4)).toBe('abcdefgh');
  });

  it('keeps archived and viewer permissions read-only', () => {
    expect(permissionUtils.canEditPot({ user_id: 'u1' }, 'u1')).toBe(true);
    expect(permissionUtils.canEditPot({ user_id: 'u1', status: 'archived' }, 'u1')).toBe(false);
    expect(permissionUtils.canManageRecords({ user_id: 'u1', is_viewer: true }, 'u2')).toBe(false);
    expect(permissionUtils.canViewPot({ user_id: 'u1', is_viewer: true }, 'u2')).toBe(true);
  });
});
