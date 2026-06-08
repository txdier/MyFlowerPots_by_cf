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

function createStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

function loadPwaDiagnostics(search = '', localStorageSeed = {}) {
  const listeners = {};
  const localStorage = createStorage(localStorageSeed);
  const sessionStorage = createStorage();
  const context = {
    console,
    Date,
    JSON,
    Math,
    URL,
    setTimeout,
    clearTimeout,
    localStorage,
    sessionStorage,
    location: {
      href: `https://example.test/${search}`,
      origin: 'https://example.test',
    },
    document: {
      referrer: '',
      visibilityState: 'visible',
      addEventListener(type, handler) {
        listeners[type] = handler;
      },
    },
    navigator: {
      platform: 'test',
      userAgent: 'Vitest',
    },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    matchMedia() {
      return { matches: false };
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(readFileSync('frontend/js/pwa-diagnostics.js', 'utf8'), context, {
    filename: 'frontend/js/pwa-diagnostics.js',
  });
  return { context, localStorage, listeners };
}

function loadApiClient(fetchImpl, localStorageSeed = {}) {
  const localStorage = createStorage(localStorageSeed);
  const sessionStorage = createStorage();
  const context = {
    console,
    Date,
    JSON,
    Math,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    btoa,
    atob,
    fetch: fetchImpl,
    Response,
    Headers,
    AbortController,
    localStorage,
    sessionStorage,
    location: {
      hostname: 'example.test',
      origin: 'https://example.test',
      pathname: '/',
      search: '',
      hash: '',
    },
    addEventListener() {},
    dispatchEvent() {},
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(readFileSync('frontend/js/api-client.js', 'utf8'), context, {
    filename: 'frontend/js/api-client.js',
  });
  return { context, localStorage };
}

describe('frontend shared utilities', () => {
  const dateUtils = loadBrowserUtility('frontend/js/date-utils.js', 'MyFlowerPotsDate');
  const careUtils = loadBrowserUtility('frontend/js/care-utils.js', 'MyFlowerPotsCare');
  const formUtils = loadBrowserUtility('frontend/js/form-utils.js', 'MyFlowerPotsFormUtils');
  const permissionUtils = loadBrowserUtility('frontend/js/pot-permissions.js', 'MyFlowerPotsPotPermissions');
  const commentBarrageUtils = loadBrowserUtility('frontend/js/comment-barrage-utils.js', 'MyFlowerPotsCommentBarrage');
  const galleryUtils = (() => {
    const context = {
      console,
      Date,
      setTimeout,
      clearTimeout,
      MyFlowerPotsMedia: {
        imgUrl(src, width, height) {
          return `${src}?thumb=${width}x${height}`;
        },
        parseImageList(value) {
          if (!value) return [];
          if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
          const text = String(value || '').trim();
          if (!text) return [];
          try {
            const parsed = JSON.parse(text);
            return Array.isArray(parsed)
              ? parsed.map(item => String(item || '').trim()).filter(Boolean)
              : [text];
          } catch {
            return [text];
          }
        },
      },
      Image: class TestImage {
        set src(value) {
          this._src = value;
        }
      },
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(readFileSync('frontend/js/gallery-utils.js', 'utf8'), context, {
      filename: 'frontend/js/gallery-utils.js',
    });
    return context.MyFlowerPotsGallery;
  })();

  it('exposes import-template plant fields in the admin plant form', () => {
    const html = readFileSync('frontend/admin-plants.html', 'utf8');
    const bindings = [
      'formData.id',
      'formData.name',
      'formData.category',
      'formData.care_difficulty',
      'formData.image_url',
      'formData.basic_info.standard_name',
      'formData.basic_info.latinName',
      'formData.basic_info.family',
      'formData.basic_info.origin',
      'formData.ornamental_features.growthHabit',
      'formData.ornamental_features.flowerColor',
      'formData.ornamental_features.floweringSeason',
      'formData.ornamental_features.fragrance',
      'formData.ornamental_features.landscapeUse',
      'formData.ornamental_features.potSuitable',
      'formData.ornamental_features.symbolism',
      'formData.care_guide.lightRequirement',
      'formData.care_guide.waterRequirement',
      'formData.care_guide.temperature',
      'formData.care_guide.humidity',
      'formData.care_guide.soilRequirement',
      'formData.care_guide.droughtTolerance',
      'formData.care_guide.shadeTolerance',
      'formData.care_guide.coldTolerance',
      'formData.care_guide.watering',
      'formData.care_guide.fertilizing',
      'formData.care_guide.pruning',
      'formData.care_guide.propagation',
      'formData.care_guide.pests',
      'formData.care_guide.safetyInfo',
      'formData.care_guide.specialNotes',
    ];

    for (const binding of bindings) {
      expect(html).toContain(`v-model="${binding}"`);
    }
  });

  it('keeps admin plant mobile rows compact with selectable items', () => {
    const html = readFileSync('frontend/admin-plants.html', 'utf8');

    expect(html).toContain('v-model="selectedIds" :value="plant.id"');
    expect(html).toContain('已选 {{ selectedIds.length }}');
    expect(html).toContain('bg-emerald-50 text-emerald-700 border border-emerald-100');
    expect(html).toContain('w-40 px-6 py-4 font-semibold text-slate-600 text-center">操作</th>');
    expect(html).toContain('class="flex items-center justify-center gap-2"');
    expect(html).not.toContain('bg-slate-800 text-white rounded-xl flex items-center gap-2');
    expect(html).not.toContain('animate-in fade-in slide-in-from-bottom-4 shadow-xl');
    expect(html).not.toContain('mt-4 pt-4 border-t border-slate-50');
  });

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

  it('formats UTC SQL timestamps as local date time', () => {
    expect(dateUtils.formatUtcDateTime('2026-05-19 12:00:00')).toBe('2026-05-19 20:00');
    expect(dateUtils.formatUtcDateTime('2026-05-19T12:00:00.000Z')).toBe('2026-05-19 20:00');
  });

  it('builds local calendar dates without UTC truncation', () => {
    expect(dateUtils.getLocalDateString(new Date(2026, 4, 19, 0, 30))).toBe('2026-05-19');
  });

  it('normalizes care type aliases and Chinese actions', () => {
    expect(careUtils.normalizeCareType('watering')).toBe('water');
    expect(careUtils.normalizeCareType('', '翻盆检查')).toBe('repot');
    expect(careUtils.getCareTypeLabel('custom', '擦叶')).toBe('擦叶');
  });

  it('builds dynamic care options from custom schedules before recent other records', () => {
    const options = careUtils.buildDynamicCareTypeOptions({
      schedules: [
        { care_type: 'custom', custom_action: '擦叶' },
        { care_type: 'custom', custom_action: '加水' },
      ],
      records: [
        { type: 'other', action: '加水' },
        { type: 'other', action: '补光' },
        { type: 'other', action: '浇水' },
        { type: 'water', action: '加水' },
      ],
    });

    expect(options).toEqual([
      { value: '擦叶', label: '擦叶', icon: 'fa fa-clipboard-check', dynamic: true },
      { value: '加水', label: '加水', icon: 'fa fa-clipboard-check', dynamic: true },
      { value: '补光', label: '补光', icon: 'fa fa-clipboard-check', dynamic: true },
    ]);
  });

  it('limits recent other-record dynamic care options after de-duplicating labels', () => {
    const options = careUtils.buildDynamicCareTypeOptions({
      records: [
        { type: 'other', action: '清灰' },
        { type: 'other', action: '转盆' },
        { type: 'other', action: '观察叶片' },
        { type: 'other', action: '补光' },
        { type: 'other', action: '加水' },
        { type: 'other', action: '擦叶' },
        { type: 'other', action: '清灰' },
        { type: 'other', action: '其他' },
        { type: 'other', action: '' },
      ],
      recentRecordLimit: 5,
    });

    expect(options.map(item => item.label)).toEqual(['清灰', '转盆', '观察叶片', '补光', '加水']);
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

  it('describes the three share access states and disables collaborator access for archived pots', () => {
    const activeStates = permissionUtils.getShareAccessStates({
      isShared: true,
      isArchived: false,
      viewerCount: 2,
      collaboratorCount: 1,
    });

    expect(activeStates.map((state) => state.key)).toEqual(['public', 'viewer', 'collaborator']);
    expect(activeStates[0]).toMatchObject({
      label: '公开链接',
      statusText: '已开启',
      description: '无需登录；只能查看公开页面；不会成为成员',
      disabled: false,
    });
    expect(activeStates[1]).toMatchObject({
      label: '仅查看成员',
      statusText: '2人',
      description: '登录成员可查看记录和留言，不能编辑',
      disabled: false,
    });
    expect(activeStates[2]).toMatchObject({
      label: '共同照料成员',
      statusText: '1人',
      description: '登录成员可新增和编辑养护、时间线、提醒',
      disabled: false,
    });

    const archivedStates = permissionUtils.getShareAccessStates({
      isShared: false,
      isArchived: true,
      viewerCount: 0,
      collaboratorCount: 3,
    });

    expect(archivedStates[0].statusText).toBe('未开启');
    expect(archivedStates[1].statusText).toBe('0人');
    expect(archivedStates[2]).toMatchObject({
      statusText: '归档不可用',
      disabled: true,
      description: '归档后不能共同照料或编辑',
    });
  });

  it('rotates one reply into each comment barrage slot without duplicating barrage rows', () => {
    const item = {
      id: 'comment-1',
      senderName: 'Alice',
      comment: 'main message content',
      createdAt: '2026-05-21 08:00:00',
      replies: [
        { id: 'reply-1', senderName: 'Bob', comment: 'first reply', createdAt: '2026-05-21 08:01:00' },
        { id: 'reply-2', senderName: 'Chen', comment: 'second reply', createdAt: '2026-05-21 08:02:00' },
        { id: 'reply-3', senderName: 'Dora', comment: 'third reply', createdAt: '2026-05-21 08:03:00' },
      ],
      latestReply: { id: 'reply-3', senderName: 'Dora', comment: 'third reply', createdAt: '2026-05-21 08:03:00' },
    };

    expect(commentBarrageUtils.buildBarrageComment(item, 0, { rotationSlot: 0 }).barrageReply.id).toBe('reply-1');
    expect(commentBarrageUtils.buildBarrageComment(item, 0, { rotationSlot: 1 }).barrageReply.id).toBe('reply-2');
    expect(commentBarrageUtils.buildBarrageComment(item, 0, { rotationSlot: 2 }).barrageReply.id).toBe('reply-3');
    expect(commentBarrageUtils.buildBarrageComment(item, 0, { rotationSlot: 3 }).barrageReply.id).toBe('reply-1');
  });

  it('keeps barrage keys stable while rotating reply content', () => {
    const item = {
      id: 'comment-1',
      comment: 'main message content',
      createdAt: '2026-05-21 08:00:00',
      replies: [
        { id: 'reply-1', senderName: 'Bob', comment: 'first reply' },
        { id: 'reply-2', senderName: 'Chen', comment: 'second reply' },
      ],
    };

    const firstSlot = commentBarrageUtils.buildBarrageComment(item, 0, { rotationSlot: 0 });
    const secondSlot = commentBarrageUtils.buildBarrageComment(item, 0, { rotationSlot: 1 });

    expect(firstSlot.key).toBe(secondSlot.key);
    expect(firstSlot.barrageReply.id).toBe('reply-1');
    expect(secondSlot.barrageReply.id).toBe('reply-2');
  });

  it('treats existing comments as a comment audience when member counts are unavailable', () => {
    expect(commentBarrageUtils.hasCommentAudience({
      pot: { id: 'pot-1' },
      comments: [
        { id: 'comment-1', comment: 'existing discussion' },
      ],
    })).toBe(true);
  });

  it('keeps comment audience hidden for a private pot without members or comments', () => {
    expect(commentBarrageUtils.hasCommentAudience({
      pot: { id: 'pot-1' },
      comments: [],
    })).toBe(false);
  });

  it('allows authenticated members to comment from a token URL but blocks public visitors', () => {
    expect(commentBarrageUtils.canReplyComment({
      canCommentAsMember: true,
      isPublicVisitor: false,
      isArchived: false,
    })).toBe(true);

    expect(commentBarrageUtils.canReplyComment({
      canCommentAsMember: true,
      isPublicVisitor: true,
      isArchived: false,
    })).toBe(false);
  });

  it('uses a 5 second reply rotation interval for comment barrages', () => {
    expect(commentBarrageUtils.REPLY_ROTATION_INTERVAL_MS).toBe(5000);
  });

  it('keeps barrage reply empty or stable for comments with zero or one reply', () => {
    expect(commentBarrageUtils.buildBarrageComment({
      id: 'comment-1',
      comment: 'no reply',
      replies: [],
    }, 0, { rotationSlot: 10 }).barrageReply).toBeNull();

    const singleReply = commentBarrageUtils.buildBarrageComment({
      id: 'comment-2',
      comment: 'one reply',
      replies: [
        { id: 'reply-1', senderName: 'Bob', comment: 'only reply' },
      ],
    }, 0, { rotationSlot: 10 }).barrageReply;

    expect(singleReply).toMatchObject({ id: 'reply-1', commentPreview: 'only reply' });
  });

  it('trims barrage comment and reply previews', () => {
    const barrage = commentBarrageUtils.buildBarrageComment({
      id: 'comment-1',
      comment: 'abcdefghijklmnopqrstuvwxyz',
      replies: [
        { id: 'reply-1', senderName: 'Bob', comment: '12345678901234567890' },
      ],
    }, 0, { rotationSlot: 0 });

    expect(barrage.commentPreview).toBe('abcdefghijklmnopqr...');
    expect(barrage.barrageReply.commentPreview).toBe('12345678901234...');
  });

  it('keeps gallery metadata when opening object-based images', () => {
    const previewImages = { value: [] };
    const previewIndex = { value: 0 };
    const loadToken = { value: 0 };
    const gallery = galleryUtils.createGallery({ previewImages, previewIndex, loadToken });

    gallery.openGallery(
      { fullSrc: '/img/b.jpg' },
      [
        { fullSrc: '/img/a.jpg', description: 'first bloom', date: '2026-05-01', timelineId: 1 },
        { fullSrc: '/img/b.jpg', description: 'new leaf', date: '2026-05-02', timelineId: 2 },
      ]
    );

    expect(previewIndex.value).toBe(1);
    expect(previewImages.value[1]).toMatchObject({
      fullSrc: '/img/b.jpg',
      previewSrc: '/img/b.jpg?thumb=100x100',
      description: 'new leaf',
      date: '2026-05-02',
      timelineId: 2,
    });
  });

  it('builds a flat timeline gallery with descriptions for every image', () => {
    const items = galleryUtils.buildTimelineGalleryItems([
      {
        id: 10,
        date: '2026-05-01',
        description: 'first bloom',
        operatorName: 'Alice',
        images: ['/img/a.jpg', '/img/b.jpg'],
      },
      {
        id: 11,
        date: '2026-05-03',
        description: '',
        operator_name: 'Bob',
        images: JSON.stringify(['/img/c.jpg']),
      },
    ]);

    expect(items).toEqual([
      {
        fullSrc: '/img/a.jpg',
        previewSrc: '/img/a.jpg?thumb=100x100',
        timelineId: 10,
        date: '2026-05-01',
        description: 'first bloom',
        operatorName: 'Alice',
      },
      {
        fullSrc: '/img/b.jpg',
        previewSrc: '/img/b.jpg?thumb=100x100',
        timelineId: 10,
        date: '2026-05-01',
        description: 'first bloom',
        operatorName: 'Alice',
      },
      {
        fullSrc: '/img/c.jpg',
        previewSrc: '/img/c.jpg?thumb=100x100',
        timelineId: 11,
        date: '2026-05-03',
        description: '',
        operatorName: 'Bob',
      },
    ]);
  });

  it('limits gallery indicator dots around the current image', () => {
    expect(galleryUtils.buildGalleryIndicatorIndexes(8, 3, 12)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(galleryUtils.buildGalleryIndicatorIndexes(30, 0, 7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(galleryUtils.buildGalleryIndicatorIndexes(30, 15, 7)).toEqual([12, 13, 14, 15, 16, 17, 18]);
    expect(galleryUtils.buildGalleryIndicatorIndexes(30, 29, 7)).toEqual([23, 24, 25, 26, 27, 28, 29]);
  });

  it('keeps PWA diagnostics off until explicitly enabled', () => {
    const { context, localStorage, listeners } = loadPwaDiagnostics();

    expect(context.flowerpotsPwaDiagnostics.isEnabled()).toBe(false);
    expect(context.flowerpotsPwaDiagnostics.get()).toEqual([]);
    expect(localStorage.getItem('flowerpots_pwa_diagnostics')).toBeNull();
    expect(Object.keys(listeners)).toEqual([]);
  });

  it('records PWA diagnostics when the URL toggle is enabled', () => {
    const { context, localStorage, listeners } = loadPwaDiagnostics('?pwaDiagnostics=1');

    expect(context.flowerpotsPwaDiagnostics.isEnabled()).toBe(true);
    expect(localStorage.getItem('flowerpots_pwa_diagnostics_enabled')).toBe('1');
    expect(context.flowerpotsPwaDiagnostics.get()[0].event).toBe('load');
    expect(Object.keys(listeners)).toContain('pagehide');
  });

  it('refreshes remembered auth before clearing a 401 bootstrap response', async () => {
    const refreshedPayload = btoa(JSON.stringify({ remember: true })).replace(/=/g, '');
    const refreshedToken = `header.${refreshedPayload}.signature`;
    const requests = [];
    const fetchImpl = async (url, options = {}) => {
      requests.push({ url, options });
      if (url.endsWith('/api/bootstrap') && requests.length === 1) {
        return new Response(JSON.stringify({ error: 'Authentication required' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/api/auth/refresh')) {
        return new Response(JSON.stringify({
          success: true,
          token: refreshedToken,
          userId: 'user-1',
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ success: true, user: { id: 'user-1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const { context, localStorage } = loadApiClient(fetchImpl, {
      flowerpots_token: 'expired-token',
      flowerpots_user_id: 'user-1',
      flowerpots_auth_remember: 'true',
    });

    const res = await context.apiClient.request('/api/bootstrap');

    expect(res.success).toBe(true);
    expect(localStorage.getItem('flowerpots_token')).toBe(refreshedToken);
    expect(JSON.parse(requests[1].options.body)).toEqual({ remember: true });
    expect(requests.map((request) => request.url)).toEqual([
      '/api/bootstrap',
      '/api/auth/refresh',
      '/api/bootstrap',
    ]);
  });

  it('detects static route drift between Worker and Wrangler config', async () => {
    const { findStaticRouteDrift } = await import('../../scripts/check-static-routes.js');
    const indexSource = [
      "const STATIC_PAGE_PATHS = new Set(['/', '/about']);",
      "const SEO_PUBLIC_PAGE_PATHS = new Set(['/', '/about']);",
      "const SITEMAP_PATHS = ['/', '/about'];",
    ].join('\n');
    const goodWrangler = 'run_worker_first = ["/", "/about", "/about.html"]';
    const badWrangler = 'run_worker_first = ["/", "/about"]';

    expect(findStaticRouteDrift(indexSource, goodWrangler).errors).toEqual([]);
    expect(findStaticRouteDrift(indexSource, badWrangler).errors).toContain(
      'wrangler.toml run_worker_first is missing /about.html for static page /about'
    );
  });

  it('detects public SEO page drift between sitemap and route config', async () => {
    const { findStaticRouteDrift } = await import('../../scripts/check-static-routes.js');
    const indexSource = [
      "const STATIC_PAGE_PATHS = new Set(['/', '/about', '/plant-care-records']);",
      "const SEO_PUBLIC_PAGE_PATHS = new Set(['/', '/about', '/plant-care-records']);",
      "const SITEMAP_PATHS = ['/', '/about'];",
    ].join('\n');
    const wranglerSource = 'run_worker_first = ["/", "/about", "/about.html", "/plant-care-records", "/plant-care-records.html"]';

    expect(findStaticRouteDrift(indexSource, wranglerSource).errors).toContain(
      'src/index.ts SITEMAP_PATHS is missing public SEO page /plant-care-records'
    );
  });
});
