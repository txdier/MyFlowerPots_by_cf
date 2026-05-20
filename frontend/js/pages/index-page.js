        const { createApp, ref, reactive, onMounted, onUnmounted, computed, nextTick, watch } = Vue;

        createApp({
            setup() {
                const formUtils = window.MyFlowerPotsFormUtils;
                const nav = window.MyFlowerPotsNavigation;
                const batchActions = window.MyFlowerPotsBatchActions;
                const showAlert = window.MyFlowerPotsDialog.alert;
                const showConfirm = window.MyFlowerPotsDialog.confirm;
                const isLoading = ref(true);
                const pots = ref([]);
                const isPotSearchActive = ref(false);
                const potSearchQuery = ref('');
                const searchFilter = ref('');
                const showSearchFilterMenu = ref(false);
                const potSearchInput = ref(null);
                const POT_PAGE_SIZE = 20;
                const isLoadingMore = ref(false);
                const hasMorePots = ref(false);
                const currentPotsPage = ref(1);
                const activePotStatus = ref('active');
                const potStatusTabs = [
                    { label: '养护中', value: 'active' },
                    { label: '已归档', value: 'archived' }
                ];
                const potStatusCounts = reactive({
                    active: 0,
                    archived: 0
                });
                const POT_STATUS_SWIPE_EDGE_GUARD = 36;
                const POT_STATUS_SWIPE_DISTANCE = 108;
                const POT_STATUS_SWIPE_RATIO = 1.8;
                const potStatusSwipe = reactive({
                    tracking: false,
                    active: false,
                    startX: 0,
                    startY: 0,
                    source: '',
                    target: '',
                    direction: 0,
                    progress: 0
                });
                const user = ref(null);
                const isLoggedIn = ref(false);
                const userDisplayName = computed(() => {
                    // 匿名用户
                    if (user.value?.userType === 'anonymous') return '匿名用户';
                    // 正式用户已登录
                    if (isLoggedIn.value && user.value) {
                        return user.value.displayName || user.value.email?.split('@')[0] || '用户';
                    }
                    // 未登录
                    return '未登录';
                });
                const navUserDisplayName = computed(() => {
                    if (user.value?.userType === 'anonymous') return '匿名';
                    return formUtils.limitTextDisplayWidth(userDisplayName.value, 4);
                });
                const careReminders = ref([]); // 今日待养护
                const isCareRemindersLoading = ref(false);
                const showRemindersExpanded = ref(false); // 默认折叠
                const isEditMode = ref(false); // 统一管理模式
                const batchFilter = ref('');
                const batchFilterQuery = ref('');
                const showBatchFilterMenu = ref(false);
                const potsGrid = ref(null);    // 列表容器Ref
                let sortableInstance = null;   // Sortable实例
                let sortableLibraryPromise = null;
                const loadSortableLibrary = () => {
                    if (window.Sortable) return Promise.resolve(window.Sortable);
                    if (!sortableLibraryPromise) {
                        sortableLibraryPromise = new Promise((resolve, reject) => {
                            const script = document.createElement('script');
                            script.src = 'js/Sortable.min.js';
                            script.onload = () => resolve(window.Sortable);
                            script.onerror = () => reject(new Error('Sortable 加载失败'));
                            document.head.appendChild(script);
                        });
                    }
                    return sortableLibraryPromise;
                };
                const showUserMenu = ref(false);
                const showLoginModal = ref(false);
                const showRegisterModal = ref(false);
                const showForgotPasswordModal = ref(false);
                const isAuthLoading = ref(false);
                const authForms = formUtils.createAuthFormController({
                    reactive,
                    computed,
                    nextTick,
                    ids: {
                        forgotPasswordEmail: 'forgotPasswordEmail'
                    }
                });
                const {
                    loginForm,
                    registerForm,
                    loginErrors,
                    registerErrors,
                    forgotPasswordErrors,
                    loginStatus,
                    registerStatus,
                    forgotPasswordStatus,
                    passwordsMatch,
                    isForgotPasswordEmailValid,
                    isLoginValid,
                    isRegisterValid,
                    clearStatus,
                    clearAuthFeedback,
                    syncLoginFormFromDom,
                    syncRegisterFormFromDom,
                    stopLoginAutofillWatcher,
                    scheduleLoginAutofillSync,
                    scheduleRegisterAutofillSync,
                    focusFieldById,
                    validateLoginEmail,
                    validateLoginPassword,
                    validateForgotPasswordEmail,
                    validateRegisterEmail,
                    validateRegisterPassword,
                    validateRegisterConfirmPassword,
                    clearRegisterConfirmPassword,
                    normalizeRegisterDisplayName,
                    handleLoginEmailInput,
                    handleLoginPasswordInput,
                    handleForgotPasswordEmailInput,
                    handleRegisterEmailInput,
                    handleRegisterDisplayNameInput,
                    handleRegisterPasswordInput,
                    handleRegisterConfirmPasswordInput,
	                    validateLoginForm,
	                    validateRegisterForm
	                } = authForms;
	                const keyboardViewport = formUtils.createKeyboardViewportController({
	                    ref,
	                    computed,
	                    onMounted,
	                    onUnmounted
	                });
		                const {
		                    keyboardModalStyle,
		                    authKeyboardModalStyle,
		                    isKeyboardActive: isAuthKeyboardActive,
		                    authKeyboardMode,
		                    handleKeyboardFieldFocus,
		                    handleAuthKeyboardFieldFocus,
		                    handleAuthCompositionStart,
		                    handleAuthCompositionEnd,
		                    handleAuthFocusOut,
		                    submitAuthFormFromEnter
		                } = keyboardViewport;
	                const turnstileForms = window.createTurnstileController({
                    ref,
                    computed,
                    nextTick,
                    contexts: {
                        register: { containerId: 'registerTurnstile', action: 'register' },
                        forgotPassword: { containerId: 'forgotPasswordTurnstile', action: 'forgot_password' }
                    }
                });
                const isTurnstileEnabled = turnstileForms.isEnabled;
                const registerTurnstileToken = turnstileForms.tokenFor('register');
                const forgotPasswordTurnstileToken = turnstileForms.tokenFor('forgotPassword');
                const isRegisterTurnstileReady = turnstileForms.isReady('register');
                const isForgotPasswordTurnstileReady = turnstileForms.isReady('forgotPassword');
                const authIntent = reactive({
                    notice: '',
                    open: '',
                    redirect: '',
                    message: '',
                    source: ''
                });
                const entryNotice = reactive({
                    show: false,
                    tone: 'info',
                    icon: 'fa-info-circle',
                    title: '',
                    message: ''
                });
                const unreadCount = ref(0);
                const supportUnreadCount = ref(0);
                const showMessageCenter = ref(false);
                const messagesList = ref([]);
                const isMessagesLoading = ref(false);
                const messageTab = ref('all'); // 'all' | 'unread'

                // 批量养护弹窗状态
                const showBatchActionSheet = ref(false);
                const showBatchCareModal = ref(false);
                const isBatchCareLoading = ref(false);
                const showBatchArchiveModal = ref(false);
                const isBatchArchiveLoading = ref(false);
                const showBatchInviteModal = ref(false);
                const isBatchInviteLoading = ref(false);
                const showPotActionSheet = ref(false);
                const activePotAction = ref(null);
                const archiveTargetPot = ref(null);
                const archiveFileInput = ref(null);
                const isOverlayClosing = ref(false);
                const batchInviteToken = ref(null);
                const batchInviteSessionId = ref('');
                const batchCareForm = reactive({
                    type: 'water',
                    types: ['water'],
                    action: '',
                    careDate: MyFlowerPotsDate.getLocalDateString(),
                    description: ''
                });
                const batchCareTypeOptions = [
                    {
                        type: 'water',
                        action: '浇水',
                        label: '浇水',
                        icon: 'fa-tint',
                        activeClass: 'bg-blue-500 text-white border-blue-500 shadow-md shadow-blue-100',
                        inactiveClass: 'bg-white text-gray-600 border-gray-100 hover:border-blue-200'
                    },
                    {
                        type: 'fertilize',
                        action: '施肥',
                        label: '施肥',
                        icon: 'fa-seedling',
                        activeClass: 'bg-green-500 text-white border-green-500 shadow-md shadow-green-100',
                        inactiveClass: 'bg-white text-gray-600 border-gray-100 hover:border-green-200'
                    },
                    {
                        type: 'custom',
                        action: '',
                        label: '自定义',
                        icon: 'fa-pen',
                        activeClass: 'bg-purple-500 text-white border-purple-500 shadow-md shadow-purple-100',
                        inactiveClass: 'bg-white text-gray-600 border-gray-100 hover:border-purple-200'
                    }
                ];
                const batchArchiveReasons = ['枯萎', '烂根', '病虫害', '环境不适', '送人/不再养护', '其他'];
                const batchArchiveForm = reactive({
                    reason: '枯萎',
                    note: '',
                    tempImages: []
                });
                const batchInviteForm = reactive({
                    permission: 'viewer',
                    method: 'email',
                    email: ''
                });

                const filteredMessages = computed(() => {
                    if (messageTab.value === 'unread') {
                        return messagesList.value.filter(m => m.status === 'unread');
                    }
                    return messagesList.value;
                });
                const notificationBadgeCount = computed(() => unreadCount.value + supportUnreadCount.value);
                const isOwnedPotData = (pot) => !!pot && !pot.is_collaborator && !pot.is_viewer;
                const isViewerOnlyPot = (pot) => !!pot && pot.is_viewer && !pot.is_collaborator;
                const isBatchCareManageablePot = (pot) => !!pot && (isOwnedPotData(pot) || pot.is_collaborator);
                const ownedPots = computed(() => pots.value.filter(isOwnedPotData));
                const collaborativePots = computed(() => pots.value.filter(p => p.is_collaborator));
                const viewerPots = computed(() => pots.value.filter(isViewerOnlyPot));
                const batchManageablePots = computed(() => {
                    if (activePotStatus.value === 'active') {
                        return pots.value.filter(p => isBatchCareManageablePot(p) || isViewerOnlyPot(p));
                    }
                    return pots.value.filter(p => isOwnedPotData(p) || isViewerOnlyPot(p));
                });
                const potSearchTerms = computed(() => (
                    potSearchQuery.value
                        .trim()
                        .toLowerCase()
                        .split(/\s+/)
                        .filter(Boolean)
                ));
                const hasPotSearchQuery = computed(() => potSearchTerms.value.length > 0);
                const getPotSearchableText = (pot) => [
                    pot.name,
                    pot.plant_type,
                    pot.note
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                const searchMatchedPots = computed(() => {
                    const terms = potSearchTerms.value;
                    if (terms.length === 0) return pots.value;

                    return pots.value.filter(pot => {
                        const searchableText = getPotSearchableText(pot);
                        return terms.every(term => searchableText.includes(term));
                    });
                });
                const builtInCareFilterOrder = ['water', 'fertilize', 'prune', 'repot', 'pest'];
                const builtInCareFilterLabels = {
                    water: '待浇水',
                    fertilize: '待施肥',
                    prune: '待修剪',
                    repot: '待换盆',
                    pest: '待病虫害处理'
                };
                const builtInCareFilterIcons = {
                    water: 'fa-tint',
                    fertilize: 'fa-seedling',
                    prune: 'fa-cut',
                    repot: 'fa-exchange-alt',
                    pest: 'fa-bug'
                };
                const getCareIconName = (icon) => {
                    const parts = String(icon || '').split(/\s+/).filter(Boolean);
                    return parts.filter(part => part !== 'fa').pop() || 'fa-clipboard-check';
                };
                const normalizeCareFilterType = (careType, customAction = '') => {
                    const careUtils = window.MyFlowerPotsCare;
                    if (careUtils?.normalizeCareType) {
                        return careUtils.normalizeCareType(careType, customAction);
                    }

                    const raw = String(careType || '').trim().toLowerCase();
                    if (['water', 'watering', 'change_water', 'water_change', 'changewater', '换水', '浇水'].includes(raw)) return 'water';
                    if (['fertilize', 'fertilizer', 'feed', '施肥'].includes(raw)) return 'fertilize';
                    if (['trim', 'prune', 'pruning', '修剪'].includes(raw)) return 'prune';
                    if (['repot', 're-pot', '换盆'].includes(raw)) return 'repot';
                    if (['pest', 'pests', '除虫', '病虫害'].includes(raw)) return 'pest';

                    const action = String(customAction || '').trim();
                    if (/换水|浇水|补水/.test(action)) return 'water';
                    if (/施肥|追肥/.test(action)) return 'fertilize';
                    if (/修剪|打顶|摘心/.test(action)) return 'prune';
                    if (/换盆|翻盆/.test(action)) return 'repot';
                    if (/除虫|病虫害|杀虫/.test(action)) return 'pest';
                    return 'custom';
                };
                const getCareReminderFilterMeta = (reminder) => {
                    const customAction = String(reminder?.customAction || '').trim();
                    const careType = String(reminder?.careType || '').trim();
                    const careUtils = window.MyFlowerPotsCare;
                    const isCustom = careType.toLowerCase() === 'custom';
                    const normalized = normalizeCareFilterType(careType, customAction);
                    const icon = getCareIconName(careUtils?.getCareTypeIcon?.(careType, customAction)) ||
                        builtInCareFilterIcons[normalized] ||
                        'fa-clipboard-check';

                    if (isCustom && customAction) {
                        return {
                            value: `care:custom:${encodeURIComponent(customAction)}`,
                            label: `待${customAction}`,
                            icon: builtInCareFilterIcons[normalized] || icon,
                            order: 1000
                        };
                    }

                    if (builtInCareFilterOrder.includes(normalized)) {
                        return {
                            value: `care:${normalized}`,
                            label: builtInCareFilterLabels[normalized],
                            icon: builtInCareFilterIcons[normalized] || icon,
                            order: builtInCareFilterOrder.indexOf(normalized)
                        };
                    }

                    const fallbackLabel = customAction || careUtils?.getCareTypeLabel?.(careType, customAction) || careType || '养护';
                    return {
                        value: `care:custom:${encodeURIComponent(fallbackLabel)}`,
                        label: `待${fallbackLabel}`,
                        icon,
                        order: 1000
                    };
                };
                const dueCarePotIds = computed(() => new Set(careReminders.value.map(item => String(item.potId))));
                const potDueTypeIconsMap = computed(() => {
                    const grouped = new Map();
                    careReminders.value.forEach((reminder) => {
                        const potId = String(reminder?.potId || '');
                        if (!potId) return;
                        if (!grouped.has(potId)) grouped.set(potId, []);
                        grouped.get(potId).push({
                            icon: getReminderTypeIcon(reminder.careType, reminder.customAction),
                            colorClass: getReminderDueStageColorClass(reminder),
                            title: reminder.customAction || getReminderTypeLabel(reminder.careType, reminder.customAction) || '养护提醒'
                        });
                    });
                    return grouped;
                });
                const dueCareFilterEntries = computed(() => {
                    const entries = new Map();
                    careReminders.value.forEach((reminder) => {
                        const potId = String(reminder?.potId || '');
                        if (!potId) return;
                        const meta = getCareReminderFilterMeta(reminder);
                        if (!meta?.value) return;
                        if (!entries.has(meta.value)) {
                            entries.set(meta.value, { ...meta, potIds: new Set() });
                        }
                        entries.get(meta.value).potIds.add(potId);
                    });
                    return entries;
                });
                const getPotsFilteredByType = (source, filter) => {
                    if (!filter) return source;
                    if (filter === 'due') {
                        return source.filter(pot => dueCarePotIds.value.has(String(pot.id)));
                    }
                    if (String(filter).startsWith('care:')) {
                        const potIds = dueCareFilterEntries.value.get(filter)?.potIds || new Set();
                        return source.filter(pot => potIds.has(String(pot.id)));
                    }
                    if (filter === 'owned') {
                        return source.filter(isOwnedPotData);
                    }
                    if (filter === 'collaborator') {
                        return source.filter(pot => pot.is_collaborator);
                    }
                    if (filter === 'viewer') {
                        return source.filter(isViewerOnlyPot);
                    }
                    return source;
                };
                const getBatchFilteredPots = (source, filter = batchFilter.value) => {
                    if (!isEditMode.value) return source;
                    return getPotsFilteredByType(source, filter);
                };
                const hasActiveSearchFilter = computed(() => !!searchFilter.value);
                const searchFilteredPots = computed(() => (
                    isPotSearchActive.value ? getPotsFilteredByType(searchMatchedPots.value, searchFilter.value) : searchMatchedPots.value
                ));
                const batchFilterTerms = computed(() => batchFilterQuery.value.trim().toLowerCase().split(/\s+/).filter(Boolean));
                const hasActiveBatchFilter = computed(() => !!batchFilter.value || batchFilterTerms.value.length > 0);
                const getBatchQueryFilteredPots = (source) => {
                    const terms = batchFilterTerms.value;
                    if (terms.length === 0) return source;
                    return source.filter(pot => {
                        const searchableText = getPotSearchableText(pot);
                        return terms.every(term => searchableText.includes(term));
                    });
                };
                const visibleBatchPots = computed(() => getBatchQueryFilteredPots(getBatchFilteredPots(pots.value)));
                const displayedPots = computed(() => (
                    isEditMode.value ? visibleBatchPots.value : searchFilteredPots.value
                ));
                const isPotSearchEmpty = computed(() => (
                    !isEditMode.value &&
                    isPotSearchActive.value &&
                    (hasPotSearchQuery.value || hasActiveSearchFilter.value) &&
                    displayedPots.value.length === 0
                ));
                const isBatchFilterEmpty = computed(() => (
                    isEditMode.value &&
                    hasActiveBatchFilter.value &&
                    displayedPots.value.length === 0 &&
                    !isPotSearchEmpty.value
                ));
                const batchFilterOptions = computed(() => {
                    const source = pots.value;
                    const options = [];
                    const dueCount = activePotStatus.value === 'active'
                        ? source.filter(pot => dueCarePotIds.value.has(String(pot.id))).length
                        : 0;
                    const sourcePotIds = new Set(source.map(pot => String(pot.id)));
                    const ownedCount = source.filter(isOwnedPotData).length;
                    const collaboratorCount = source.filter(pot => pot.is_collaborator).length;
                    const viewerCount = source.filter(isViewerOnlyPot).length;

                    if (dueCount > 0) {
                        options.push({ value: 'due', label: '待养护', count: dueCount, icon: 'fa-tint' });
                        Array.from(dueCareFilterEntries.value.values())
                            .map(entry => ({
                                value: entry.value,
                                label: entry.label,
                                icon: entry.icon,
                                count: Array.from(entry.potIds).filter(potId => sourcePotIds.has(potId)).length,
                                order: entry.order
                            }))
                            .filter(option => option.count > 0)
                            .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'zh-Hans-CN'))
                            .forEach(({ order, ...option }) => options.push(option));
                    }
                    if (ownedCount > 0 && ownedCount < source.length) options.push({ value: 'owned', label: '我的', count: ownedCount, icon: 'fa-user' });
                    if (collaboratorCount > 0 && collaboratorCount < source.length) options.push({ value: 'collaborator', label: '共同照料', count: collaboratorCount, icon: 'fa-users' });
                    if (viewerCount > 0 && viewerCount < source.length) options.push({ value: 'viewer', label: '仅查看', count: viewerCount, icon: 'fa-eye' });

                    return options;
                });
                const setBatchFilter = (filter) => {
                    if (batchFilter.value === filter) {
                        batchFilter.value = '';
                        showBatchFilterMenu.value = false;
                        return;
                    }
                    if (batchFilterOptions.value.some(option => option.value === filter)) {
                        batchFilter.value = filter;
                        showBatchFilterMenu.value = false;
                    }
                };
                const clearBatchFilterFromMenu = () => {
                    batchFilter.value = '';
                    batchFilterQuery.value = '';
                    showBatchFilterMenu.value = false;
                };
                const searchFilterOptions = computed(() => batchFilterOptions.value);
                const setSearchFilter = (filter) => {
                    if (searchFilter.value === filter) {
                        searchFilter.value = '';
                        showSearchFilterMenu.value = false;
                        return;
                    }
                    if (searchFilterOptions.value.some(option => option.value === filter)) {
                        searchFilter.value = filter;
                        showSearchFilterMenu.value = false;
                    }
                };
                const clearSearchFilterFromMenu = () => {
                    searchFilter.value = '';
                    showSearchFilterMenu.value = false;
                };
                const toggleSearchFilterMenu = () => {
                    showSearchFilterMenu.value = !showSearchFilterMenu.value;
                    showUserMenu.value = false;
                };
                const selectedOwnedPots = computed(() => pots.value.filter(p => p.selected && isOwnedPotData(p)));
                const selectedCareManageablePots = computed(() => pots.value.filter(p => p.selected && isBatchCareManageablePot(p)));
                const selectedViewerPots = computed(() => pots.value.filter(p => p.selected && isViewerOnlyPot(p)));
                const selectedOwnedCount = computed(() => selectedOwnedPots.value.length);
                const selectedCareManageableCount = computed(() => selectedCareManageablePots.value.length);
                const selectedViewerCount = computed(() => selectedViewerPots.value.length);
                const selectedExcludedCount = computed(() => Math.max(0, selectedCount.value - selectedOwnedCount.value));
                const selectedCareExcludedCount = computed(() => Math.max(0, selectedCount.value - selectedCareManageableCount.value));

                const hasEmailAccount = computed(() => !!(user.value && user.value.userType === 'email'));
                const isBatchInviteEmailValid = computed(() => formUtils.isValidEmail(batchInviteForm.email));
                const canUseNativeShare = computed(() => !!(
                    typeof window !== 'undefined' &&
                    window.isSecureContext !== false &&
                    typeof navigator !== 'undefined' &&
                    typeof navigator.share === 'function'
                ));
                const loginModalLead = computed(() => batchInviteToken.value
                    ? '登录后即可接受好友发来的批量邀请'
                    : '登录以同步您的花盆数据');
                const registerModalLead = computed(() => batchInviteToken.value
                    ? '注册后即可接受好友发来的批量邀请，并保存到你的花盆列表'
                    : '开始您的智能养花之旅');
                const entryNoticeClass = computed(() => ({
                    'bg-amber-50 border-amber-100 text-amber-700': entryNotice.tone === 'warning',
                    'bg-rose-50 border-rose-100 text-rose-700': entryNotice.tone === 'error',
                    'bg-blue-50 border-blue-100 text-blue-700': entryNotice.tone === 'info',
                    'bg-green-50 border-green-100 text-green-700': entryNotice.tone === 'success'
                }));
                const hasOverlayModalOpen = computed(() =>
                    isOverlayClosing.value ||
                    showLoginModal.value ||
                    showRegisterModal.value ||
                    showForgotPasswordModal.value ||
                    showMessageCenter.value ||
                    showPotActionSheet.value ||
                    showBatchActionSheet.value ||
                    showBatchCareModal.value ||
                    showBatchArchiveModal.value ||
                    showBatchInviteModal.value
                );
                const emptyStateTitle = computed(() => (
                    activePotStatus.value === 'archived' ? '暂无归档植物' : '空空如也'
                ));
                const emptyStateMessage = computed(() => (
                    activePotStatus.value === 'archived'
                        ? '养失败、送人或停止养护的植物会保留在这里'
                        : '您还没有添加任何花盆，点击下方按钮开始记录第一株植物吧'
                ));
                const showPotStatusSwitch = computed(() =>
                    potStatusCounts.archived > 0 || activePotStatus.value === 'archived'
                );

                const allSelected = computed(() => {
                    const selectablePots = isEditMode.value ? displayedPots.value : pots.value;
                    return selectablePots.length > 0 && selectablePots.every(p => p.selected);
                });
                const selectedCount = computed(() => pots.value.filter(p => p.selected).length);

                watch(selectedCount, (val) => {
                    if (val === 0) {
                        showBatchActionSheet.value = false;
                    }
                });
                watch(batchFilterOptions, (options) => {
                    if (!options.some(option => option.value === batchFilter.value)) {
                        batchFilter.value = '';
                    }
                    if (!options.some(option => option.value === searchFilter.value)) {
                        searchFilter.value = '';
                    }
                });

                // 分组计算属性
                const groupedReminders = computed(() => {
                    const groups = {};
                    careReminders.value.forEach(r => {
                        if (!groups[r.potId]) {
                            groups[r.potId] = {
                                potId: r.potId,
                                potName: r.potName,
                                potImage: r.potImage,
                                tasks: []
                            };
                        }
                        groups[r.potId].tasks.push(r);
                    });
                    // 将对象转为数组
                    return Object.values(groups);
                });
                const seasonalHeaderReminders = ref([]);
                const currentSeasonalHeaderIndex = ref(0);
                const groupedSeasonalReminders = computed(() => {
                    const entries = [];
                    const seen = new Set();

                    for (const group of groupedReminders.value) {
                        for (const task of group.tasks) {
                            const tip = getTaskSeasonalTip(group.potId, task.careType, task.customAction);
                            if (!tip?.text) continue;

                            const key = `${group.potId}:${tip.text}`;
                            if (seen.has(key)) continue;
                            seen.add(key);
                            entries.push({
                                potId: group.potId,
                                potName: group.potName,
                                season: tip.season,
                                text: tip.text,
                                guideKey: tip.guideKey
                            });
                        }
                    }

                    return entries;
                });
                const navSeasonalReminderPool = computed(() => (
                    seasonalHeaderReminders.value.length > 0
                        ? seasonalHeaderReminders.value
                        : groupedSeasonalReminders.value
                ));
                const navSeasonalReminder = computed(() => {
                    if (activePotStatus.value !== 'active') return null;
                    const pool = navSeasonalReminderPool.value;
                    if (pool.length === 0) return null;

                    const index = currentSeasonalHeaderIndex.value % pool.length;
                    return pool[index];
                });
                const hasTopReminderBlock = computed(() =>
                    activePotStatus.value === 'active' && careReminders.value.length > 0 && !isEditMode.value && !isPotSearchActive.value
                );
                let overlayCloseTimer = null;
                let seasonalHeaderRotationTimer = null;
                let bootstrapRefreshPromise = null;

                const holdOverlayGuard = () => {
                    isOverlayClosing.value = true;
                    if (overlayCloseTimer) {
                        clearTimeout(overlayCloseTimer);
                    }
                    overlayCloseTimer = setTimeout(() => {
                        isOverlayClosing.value = false;
                        overlayCloseTimer = null;
                    }, 260);
                };

                const getPotOrderStorageKey = (status = activePotStatus.value) => {
                    const currentUserId = apiClient.userId || window.authStorage?.getUserId() || 'guest';
                    return `flowerpots_home_order_${currentUserId}_${status || 'active'}`;
                };

                const applyStoredPotOrder = (potList, status = activePotStatus.value) => {
                    try {
                        const legacyKey = `flowerpots_home_order_${apiClient.userId || window.authStorage?.getUserId() || 'guest'}`;
                        const raw = localStorage.getItem(getPotOrderStorageKey(status))
                            || (status === 'active' ? localStorage.getItem(legacyKey) : null);
                        const storedIds = raw ? JSON.parse(raw) : null;
                        if (!Array.isArray(storedIds) || storedIds.length === 0) return potList;
                        const orderMap = new Map(storedIds.map((id, index) => [id, index]));
                        return [...potList].sort((a, b) => {
                            const aIndex = orderMap.has(a.id) ? orderMap.get(a.id) : Number.MAX_SAFE_INTEGER;
                            const bIndex = orderMap.has(b.id) ? orderMap.get(b.id) : Number.MAX_SAFE_INTEGER;
                            return aIndex - bIndex;
                        });
                    } catch (error) {
                        console.error('Failed to apply stored pot order:', error);
                        return potList;
                    }
                };

                const persistLocalPotOrder = (status = activePotStatus.value) => {
                    try {
                        localStorage.setItem(getPotOrderStorageKey(status), JSON.stringify(pots.value.map(p => p.id)));
                    } catch (error) {
                        console.error('Failed to persist pot order:', error);
                    }
                };

                const getParamWithFallback = (name) => {
                    const params = new URLSearchParams(window.location.search);
                    const directValue = params.get(name);
                    if (directValue) return directValue;

                    const hash = window.location.hash?.replace(/^#/, '');
                    if (hash) {
                        const hashParams = new URLSearchParams(hash);
                        const hashValue = hashParams.get(name);
                        if (hashValue) return hashValue;
                    }

                    if (name === 'batchInviteToken') {
                        return sessionStorage.getItem('pending_batch_invite_token');
                    }

                    return null;
                };

                const getInviteSessionId = (key, targetRef) => {
                    let sessionId = sessionStorage.getItem(key);
                    if (!sessionId) {
                        sessionId = crypto.randomUUID().replace(/-/g, '');
                        sessionStorage.setItem(key, sessionId);
                    }
                    targetRef.value = sessionId;
                    return sessionId;
                };

                const copyTextSafely = async (text) => {
                    try {
                        if (!window.MyFlowerPotsClipboard?.copyText) return false;
                        return await window.MyFlowerPotsClipboard.copyText(text);
                    } catch (error) {
                        console.error('Copy helper failed:', error);
                        return false;
                    }
                };

                const showCopyFallback = (text, message) => {
                    if (window.MyFlowerPotsClipboard?.showCopyPrompt) {
                        window.MyFlowerPotsClipboard.showCopyPrompt(text, message);
                        return;
                    }
                    showAlert(`${message}\n${text}`);
                };

                const shareViaSystem = async ({ title, text, url }) => {
                    if (!canUseNativeShare.value || !url) return { status: 'unsupported' };
                    try {
                        if (typeof navigator.canShare === 'function' && !navigator.canShare({ url })) {
                            return { status: 'unsupported' };
                        }
                        await navigator.share({ title, text, url });
                        return { status: 'shared' };
                    } catch (error) {
                        if (error?.name === 'AbortError') {
                            return { status: 'cancelled' };
                        }
                        console.warn('Native share failed, falling back:', error);
                        return { status: 'failed', error };
                    }
                };

	                const isAuthRequiredError = (error) => {
	                    const status = Number(error?.status || 0);
	                    const message = String(error?.message || '').trim();
	                    return status === 401 || /Authentication required/i.test(message);
	                };

	                const authBodyScrollLock = { locked: false, bodyOverflow: '', htmlOverscrollBehavior: '' };
	                const setAuthModalBodyLock = (locked) => {
	                    if (typeof document === 'undefined') return;
	                    document.body.classList.toggle('auth-modal-open', !!locked);
	                    if (locked) {
	                        if (!authBodyScrollLock.locked) {
	                            authBodyScrollLock.bodyOverflow = document.body.style.overflow || '';
	                            authBodyScrollLock.htmlOverscrollBehavior = document.documentElement.style.overscrollBehavior || '';
	                            authBodyScrollLock.locked = true;
	                        }
	                        document.body.style.overflow = 'hidden';
	                        document.documentElement.style.overscrollBehavior = 'none';
	                        return;
	                    }
	                    if (!authBodyScrollLock.locked) return;
	                    document.body.style.overflow = authBodyScrollLock.bodyOverflow;
	                    document.documentElement.style.overscrollBehavior = authBodyScrollLock.htmlOverscrollBehavior;
	                    authBodyScrollLock.locked = false;
	                    authBodyScrollLock.bodyOverflow = '';
	                    authBodyScrollLock.htmlOverscrollBehavior = '';
	                };

	                watch([showLoginModal, showForgotPasswordModal, showRegisterModal], ([loginVisible, forgotVisible, registerVisible]) => {
	                    setAuthModalBodyLock(loginVisible || forgotVisible || registerVisible);
	                    if (loginVisible || forgotVisible) {
	                        scheduleLoginAutofillSync();
	                    } else {
                        stopLoginAutofillWatcher();
                    }

                    if (registerVisible) {
                        scheduleRegisterAutofillSync();
                        turnstileForms.render('register');
                    } else {
                        turnstileForms.remove('register');
                    }

                    if (forgotVisible) {
                        turnstileForms.render('forgotPassword');
                    } else {
                        turnstileForms.remove('forgotPassword');
                    }
                });

                const promptBatchInviteAuth = () => {
                    clearAuthFeedback();
                    showRegisterModal.value = false;
                    showForgotPasswordModal.value = false;
                    showLoginModal.value = true;
                };

                const dismissEntryNotice = () => {
                    entryNotice.show = false;
                };

                const resolveEntryNotice = (intent) => {
                    const templates = {
                        login_required: {
                            tone: 'warning',
                            icon: 'fa-sign-in-alt',
                            title: '请先登录',
                            message: '登录后继续访问当前内容。'
                        },
                        session_expired: {
                            tone: 'warning',
                            icon: 'fa-history',
                            title: '登录已过期',
                            message: '请重新登录后继续。'
                        },
                        forbidden: {
                            tone: 'warning',
                            icon: 'fa-shield-alt',
                            title: '无法访问',
                            message: '当前账号没有访问权限。'
                        },
                        not_found: {
                            tone: 'info',
                            icon: 'fa-search',
                            title: '内容不存在',
                            message: '内容可能已删除或链接不完整。'
                        },
                        link_expired: {
                            tone: 'info',
                            icon: 'fa-link',
                            title: '链接已失效',
                            message: '请让对方重新发送最新链接。'
                        },
                        admin_required: {
                            tone: 'error',
                            icon: 'fa-hammer',
                            title: '需要管理员权限',
                            message: '请使用管理员账号登录。'
                        },
                        server_error: {
                            tone: 'error',
                            icon: 'fa-exclamation-triangle',
                            title: '加载失败',
                            message: '请稍后重试。'
                        },
                        password_reset_success: {
                            tone: 'success',
                            icon: 'fa-check-circle',
                            title: '密码已重置',
                            message: '请使用新密码登录。'
                        }
                    };

                    return templates[intent.notice] || (intent.message
                        ? {
                            tone: 'info',
                            icon: 'fa-info-circle',
                            title: '页面提示',
                            message: intent.message
                        }
                        : null);
                };

                const applyAuthIntent = (nextIntent = {}) => {
                    authIntent.notice = nextIntent.notice || '';
                    authIntent.open = nextIntent.open || '';
                    authIntent.redirect = nav?.normalizeAppPath?.(nextIntent.redirect, { fallback: '', allowEmpty: true }) || '';
                    authIntent.message = nextIntent.message || '';
                    authIntent.source = nextIntent.source || '';

                    const notice = resolveEntryNotice(authIntent);
                    if (!notice) {
                        entryNotice.show = false;
                        return;
                    }

                    entryNotice.tone = notice.tone;
                    entryNotice.icon = notice.icon;
                    entryNotice.title = notice.title;
                    entryNotice.message = notice.message;
                    entryNotice.show = true;
                };

                const openAuthFromIntent = () => {
                    if (isLoggedIn.value) return;
                    clearAuthFeedback();
                    if (authIntent.open === 'register') {
                        showLoginModal.value = false;
                        showForgotPasswordModal.value = false;
                        showRegisterModal.value = true;
                        return;
                    }
                    if (authIntent.open === 'login') {
                        showRegisterModal.value = false;
                        showForgotPasswordModal.value = false;
                        showLoginModal.value = true;
                    }
                };

                const buildUserFromAuthResponse = (res) => ({
                    id: res.userId,
                    email: res.email || '',
                    displayName: res.displayName || '',
                    emailVerified: !!res.emailVerified,
                    userType: 'email'
                });

                const completeAuthSuccess = async (authUser = null) => {
                    dismissEntryNotice();
                    const target = nav?.normalizeAppPath?.(authIntent.redirect, { fallback: '', allowEmpty: true }) || '';
                    if (target && target !== nav.APP_PAGES.home) {
                        window.location.replace(target);
                        return;
                    }

                    clearAuthFeedback();
                    showLoginModal.value = false;
                    showRegisterModal.value = false;
                    showForgotPasswordModal.value = false;
                    showUserMenu.value = false;

                    if (authUser) {
                        user.value = authUser;
                        isLoggedIn.value = true;
                    }

                    const verifiedUser = await checkLoginStatus();
                    if (!verifiedUser && !isLoggedIn.value) {
                        return;
                    }

                    if (batchInviteToken.value) {
                        const handledBatchInvite = await tryHandleBatchInviteToken();
                        if (handledBatchInvite) return;
                    }

                    await fetchPots({ status: activePotStatus.value, blocking: true });
                    if (careReminders.value.length > 0) {
                        setTimeout(loadSeasonalTips, 100);
                    }
                };

                const init = async () => {
                    window.addEventListener('auth:expired', (event) => {
                        isLoggedIn.value = false;
                        user.value = null;
                        showUserMenu.value = false;
                        applyAuthIntent({
                            notice: 'session_expired',
                            open: 'login',
                            redirect: authIntent.redirect,
                            message: event.detail?.message || '登录状态已失效，请重新登录。',
                            source: 'auth'
                        });
                        promptBatchInviteAuth();
                    });

                    // 全局点击事件：点击页面其他区域时关闭下拉菜单
                    document.addEventListener('click', (e) => {
                        // 如果点击的不是用户菜单区域，则关闭菜单
                        const userMenuArea = document.querySelector('.user-menu-container');
                        if (userMenuArea && !userMenuArea.contains(e.target)) {
                            showUserMenu.value = false;
                        }
                    });

                    batchInviteToken.value = getParamWithFallback('batchInviteToken');
                    if (batchInviteToken.value) {
                        sessionStorage.setItem('pending_batch_invite_token', batchInviteToken.value);
                        getInviteSessionId('batch_invite_session_id', batchInviteSessionId);
                    }

                    applyAuthIntent(nav?.readAppIntent?.() || {});

                    await checkLoginStatus();
                    const handledBatchInvite = await tryHandleBatchInviteToken();
                    if (handledBatchInvite) return;
                    openAuthFromIntent();

                    await fetchPots();
                    if (careReminders.value.length > 0) {
                        setTimeout(loadSeasonalTips, 100);
                    }

                    // 监听登录状态变化，登录后立即刷新未读数
                    watch(isLoggedIn, (val) => {
                        if (val) {
                            refreshBootstrapData().then(() => {
                                if (careReminders.value.length > 0) {
                                    setTimeout(loadSeasonalTips, 100);
                                }
                            }).catch(() => { });
                            return;
                        }
                        unreadCount.value = 0;
                        supportUnreadCount.value = 0;
                        careReminders.value = [];
                        isCareRemindersLoading.value = false;
                    });
                };

                const applyBootstrapData = (res) => {
                    if (!res?.success) return false;

                    user.value = res.user || null;
                    isLoggedIn.value = !!res.user;

                    if (res.potStatusCounts) {
                        potStatusCounts.active = Number(res.potStatusCounts.active || 0);
                        potStatusCounts.archived = Number(res.potStatusCounts.archived || 0);
                    }

                    unreadCount.value = Number(res.unreadCount || 0);
                    supportUnreadCount.value = Number(res.supportUnreadCount || 0);
                    careReminders.value = Array.isArray(res.careReminders) && activePotStatus.value === 'active'
                        ? res.careReminders
                        : [];
                    isCareRemindersLoading.value = false;
                    return true;
                };

                const refreshBootstrapData = async () => {
                    const token = window.authStorage?.getToken() || null;
                    const userId = window.authStorage?.getUserId() || null;

                    if (!(token && userId)) {
                        applyBootstrapData({
                            success: true,
                            user: null,
                            potStatusCounts: { active: 0, archived: 0 },
                            unreadCount: 0,
                            supportUnreadCount: 0,
                            careReminders: []
                        });
                        return null;
                    }

                    apiClient.setToken(token, userId);
                    if (!bootstrapRefreshPromise) {
                        bootstrapRefreshPromise = apiClient.getBootstrap()
                            .then((res) => {
                                applyBootstrapData(res);
                                return res.user || null;
                            })
                            .finally(() => {
                                bootstrapRefreshPromise = null;
                            });
                    }
                    return bootstrapRefreshPromise;
                };

                const fetchUnreadCount = async () => {
                    if (!isLoggedIn.value) return;
                    try {
                        const res = await apiClient.getUnreadMessageCount();
                        if (res.success) {
                            unreadCount.value = Number(res.count) || 0;
                        }
                    } catch (e) {
                        console.error('Failed to fetch unread count:', e);
                    }
                };

                const fetchSupportUnreadCount = async () => {
                    if (!isLoggedIn.value || !user.value?.isAdmin) {
                        supportUnreadCount.value = 0;
                        return;
                    }
                    try {
                        const res = await apiClient.getSupportUnreadCount();
                        if (res.success) {
                            supportUnreadCount.value = Number(res.count) || 0;
                        }
                    } catch (e) {
                        supportUnreadCount.value = 0;
                        console.error('Failed to fetch support unread count:', e);
                    }
                };

                const openMessageCenter = async () => {
                    showUserMenu.value = false;
                    showMessageCenter.value = true;
                    fetchMessages();
                };

                const fetchMessages = async () => {
                    try {
                        isMessagesLoading.value = true;
                        const res = await apiClient.getMessages();
                        if (res.success) {
                            messagesList.value = res.data.map(m => {
                                try {
                                    m.extraData = m.extra_data ? JSON.parse(m.extra_data) : {};
                                } catch (e) {
                                    m.extraData = {};
                                }
                                m.senderDisplayName = m.sender_display_name || (m.sender_email ? m.sender_email.split('@')[0] : '');
                                return m;
                            }).filter(m => !m.extraData?.selfCopy);
                        }
                    } catch (e) { } finally {
                        isMessagesLoading.value = false;
                    }
                };

                const markMessageRead = async (msg) => {
                    if (msg.status === 'unread') {
                        try {
                            const res = await apiClient.markMessageRead(msg.id);
                            if (res.success) {
                                msg.status = 'read';
                                unreadCount.value = Math.max(0, unreadCount.value - 1);
                                // 同时刷新后端权威数值
                                fetchUnreadCount();
                            }
                        } catch (e) { }
                    }
                };

                const handleMessageAction = async (msg, action) => {
                    try {
                        if (msg.type === 'transfer_request') {
                            const token = msg.extraData.transferToken;
                            let res;
                            if (action === 'accept') {
                                res = await apiClient.acceptTransfer(token);
                                if (res.success) {
                                    showAlert('移交接受成功！');
                                    fetchPots();
                                }
                            } else if (action === 'reject') {
                                res = await apiClient.rejectTransfer(token);
                                if (res.success) showAlert('已拒绝移交请求。');
                            }
                            // 邀请通知：点击后直接跳转到对应花盆并标记已读
                            await markMessageRead(msg);
                            // 由于 markMessageRead 已经有了 fetchUnreadCount，这里不需要重复
                            if (msg.related_id) goToPotDetail(msg.related_id);
                            return;
                        }
                        // 处理后重新加载消息
                        fetchMessages();
                        fetchUnreadCount();
                    } catch (e) {
                        showAlert('操作失败: ' + e.message);
                    }
                };

                const handleMessageClick = async (msg) => {
                    await markMessageRead(msg);

                    if (msg.type === 'transfer_request' || msg.type === 'pot_comment') {
                        return;
                    }

                    if (msg.related_id) {
                        showMessageCenter.value = false;
                        goToPotDetail(msg.related_id);
                    }
                };

                const goToMessagePot = async (msg) => {
                    await markMessageRead(msg);
                    if (msg.related_id) {
                        showMessageCenter.value = false;
                        goToPotDetail(msg.related_id);
                    }
                };

                const deleteMessage = async (msgId) => {
                    if (!showConfirm('确定删除这条消息吗？')) return;
                    try {
                        const res = await apiClient.deleteMessage(msgId);
                        if (res.success) {
                            // 立即从局部列表中移除，提升响应速度
                            messagesList.value = messagesList.value.filter(m => m.id !== msgId);
                            fetchUnreadCount();
                        }
                    } catch (e) {
                        showAlert('删除失败: ' + e.message);
                    }
                };

                const clearReadMessages = async () => {
                    const readCount = messagesList.value.filter(m => m.status !== 'unread').length;
                    if (readCount === 0) return;
                    if (!showConfirm(`确定清空这 ${readCount} 条已读或已处理的消息吗？`)) return;
                    try {
                        const res = await apiClient.clearReadMessages();
                        if (res.success) {
                            fetchMessages();
                        }
                    } catch (e) {
                        showAlert('清理失败: ' + e.message);
                    }
                };

                const checkLoginStatus = async () => {
                    const token = window.authStorage?.getToken() || null;
                    const userId = window.authStorage?.getUserId() || null;

                    if (!(token && userId)) {
                        isLoggedIn.value = false;
                        user.value = null;
                        return null;
                    }

                    apiClient.setToken(token, userId);

                    try {
                        const bootUser = await refreshBootstrapData();
                        if (bootUser) {
                            return bootUser;
                        }
                    } catch (error) {
                        if (error?.status === 401 || error?.status === 404) {
                            const refreshed = error?.status === 401 ? await apiClient.refreshToken() : false;
                            if (refreshed) {
                                try {
                                    const bootUser = await refreshBootstrapData();
                                    if (bootUser) {
                                        return bootUser;
                                    }
                                } catch (refreshError) {
                                    console.warn('Failed to reload login status after token refresh:', refreshError);
                                }
                            }
                            apiClient.clearAuth();
                        } else {
                            console.warn('Failed to check login status:', error);
                        }
                    }

                    isLoggedIn.value = false;
                    user.value = null;
                    return null;
                };

                const buildBatchInviteAcceptMessage = (result) => {
                    const permissionLabel = result.permissionType === 'viewer' ? '仅查看' : '共同照料';
                    const segments = [`已接受批量${permissionLabel}邀请。`];

                    if (result.addedCount > 0) {
                        segments.push(`新增 ${result.addedCount} 个花盆权限`);
                    }
                    if (result.upgradedCount > 0) {
                        segments.push(`升级 ${result.upgradedCount} 个“仅查看”为共同照料`);
                    }
                    if (result.skippedCount > 0) {
                        segments.push(`跳过 ${result.skippedCount} 个已具备对应或更高权限的花盆`);
                    }

                    return segments.join('，') + '。';
                };

                const openBatchInviteLink = async () => {
                    await apiClient.openBatchInvite(
                        batchInviteToken.value,
                        getInviteSessionId('batch_invite_session_id', batchInviteSessionId)
                    );
                };

                const acceptBatchInviteFromLink = async () => {
                    const res = await apiClient.acceptBatchInvite(
                        batchInviteToken.value,
                        getInviteSessionId('batch_invite_session_id', batchInviteSessionId)
                    );
                    if (!res.success) {
                        throw new Error('批量邀请接受失败');
                    }

                    sessionStorage.removeItem('pending_batch_invite_token');
                    showAlert(buildBatchInviteAcceptMessage(res.data || {}));
                    window.location.replace('/');
                    return true;
                };

                const tryHandleBatchInviteToken = async () => {
                    if (!batchInviteToken.value) return false;

                    try {
                        await openBatchInviteLink();
                        if (!hasEmailAccount.value) {
                            promptBatchInviteAuth();
                            return false;
                        }

                        return await acceptBatchInviteFromLink();
                    } catch (error) {
                        console.warn('Failed to process batch invite token:', error);
                        if (isAuthRequiredError(error)) {
                            await checkLoginStatus();
                            promptBatchInviteAuth();
                            return false;
                        }

                        sessionStorage.removeItem('pending_batch_invite_token');
                        showAlert('批量邀请链接无效、已过期，或已在其他设备上使用。');
                        if (window.location.search.includes('batchInviteToken=')) {
                            window.history.replaceState({}, '', '/');
                        }
                        return false;
                    }
                };

                const fetchPots = async (options = {}) => {
                    const append = !!options.append;
                    const shouldShowLoading = !append && (options.blocking ?? pots.value.length === 0);
                    const status = options.status || activePotStatus.value;
                    const page = append ? currentPotsPage.value + 1 : 1;
                    try {
                        if (shouldShowLoading) isLoading.value = true;
                        if (append) isLoadingMore.value = true;
                        // 不在初始化时自动 identify
                        const res = await apiClient.getPots({ status, page, limit: POT_PAGE_SIZE });
                        if (res.success) {
                            const loadedPots = (res.data || []).map(p => ({ ...p, selected: false }));
                            const existingIds = new Set(append ? pots.value.map(p => p.id) : []);
                            const nextPots = append
                                ? [...pots.value, ...loadedPots.filter(p => !existingIds.has(p.id))]
                                : loadedPots;
                            pots.value = (status === 'active' || status === 'archived')
                                ? applyStoredPotOrder(nextPots, status)
                                : nextPots;
                            currentPotsPage.value = Number(res.page || page);
                            hasMorePots.value = !!res.hasMore;
                            if (status === 'active') {
                                if (!append) setTimeout(loadHeaderSeasonalReminder, 80);
                            } else if (!append) {
                                seasonalHeaderReminders.value = [];
                            }
                        } else {
                            seasonalHeaderReminders.value = [];
                            if (!append) {
                                hasMorePots.value = false;
                                currentPotsPage.value = 1;
                            }
                        }
                    } catch (e) {
                        hasMorePots.value = false;
                        if (!append) currentPotsPage.value = 1;
                    } finally {
                        if (shouldShowLoading) isLoading.value = false;
                        if (append) isLoadingMore.value = false;
                    }
                };

                const loadMorePots = async (options = {}) => {
                    if (isLoading.value || isLoadingMore.value || !hasMorePots.value || (isEditMode.value && !options.force)) return;
                    await fetchPots({ status: activePotStatus.value, append: true, blocking: false });
                };

                const loadAllRemainingPots = async () => {
                    while (hasMorePots.value && !isLoadingMore.value) {
                        await loadMorePots({ force: true });
                    }
                };

                const openPotSearch = () => {
                    if (isEditMode.value || pots.value.length === 0) return;
                    isPotSearchActive.value = true;
                    showSearchFilterMenu.value = false;
                    showRemindersExpanded.value = false;
                    showUserMenu.value = false;
                    nextTick(() => potSearchInput.value?.focus?.());
                    if (hasMorePots.value && !isLoadingMore.value) {
                        loadAllRemainingPots();
                    }
                };

                const closePotSearch = () => {
                    isPotSearchActive.value = false;
                    potSearchQuery.value = '';
                    searchFilter.value = '';
                    showSearchFilterMenu.value = false;
                };

                const clearPotSearch = () => {
                    potSearchQuery.value = '';
                    nextTick(() => potSearchInput.value?.focus?.());
                };

                let potStatusSwipeSuppressClickUntil = 0;

                const getPotStatusIndex = (status) => potStatusTabs.findIndex(tab => tab.value === status);

                const resetPotStatusSwipe = () => {
                    potStatusSwipe.tracking = false;
                    potStatusSwipe.active = false;
                    potStatusSwipe.startX = 0;
                    potStatusSwipe.startY = 0;
                    potStatusSwipe.source = '';
                    potStatusSwipe.target = '';
                    potStatusSwipe.direction = 0;
                    potStatusSwipe.progress = 0;
                };

                const canUsePotStatusSwipe = () => (
                    showPotStatusSwitch.value &&
                    !isEditMode.value &&
                    !hasOverlayModalOpen.value &&
                    !isPotSearchActive.value &&
                    !isLoading.value &&
                    !isLoadingMore.value
                );

                const getPotStatusSwipeTarget = (dx) => {
                    const sourceIndex = getPotStatusIndex(activePotStatus.value);
                    if (sourceIndex < 0) return null;

                    const targetIndex = sourceIndex + (dx < 0 ? 1 : -1);
                    return potStatusTabs[targetIndex]?.value || null;
                };

                const getPotStatusTabFillRatio = (status) => {
                    if (!potStatusSwipe.active || !potStatusSwipe.source || !potStatusSwipe.target) {
                        return activePotStatus.value === status ? 1 : 0;
                    }

                    const progress = Math.min(1, Math.max(0, potStatusSwipe.progress));
                    if (status === potStatusSwipe.source) {
                        return progress < 0.5 ? 1 - progress * 2 : 0;
                    }
                    if (status === potStatusSwipe.target) {
                        return progress > 0.5 ? (progress - 0.5) * 2 : 0;
                    }
                    return 0;
                };

                const getPotStatusTabFillStyle = (status) => {
                    const fillRatio = getPotStatusTabFillRatio(status);
                    const sourceIndex = getPotStatusIndex(potStatusSwipe.source || activePotStatus.value);
                    const targetIndex = getPotStatusIndex(potStatusSwipe.target);
                    let anchor = 'left';

                    if (potStatusSwipe.active && sourceIndex >= 0 && targetIndex >= 0) {
                        const movingRight = targetIndex > sourceIndex;
                        if (status === potStatusSwipe.source) {
                            anchor = movingRight ? 'right' : 'left';
                        } else if (status === potStatusSwipe.target) {
                            anchor = movingRight ? 'left' : 'right';
                        }
                    }

                    return {
                        width: `${Math.round(fillRatio * 1000) / 10}%`,
                        opacity: fillRatio > 0 ? 1 : 0,
                        left: anchor === 'left' ? '0' : 'auto',
                        right: anchor === 'right' ? '0' : 'auto',
                        transition: potStatusSwipe.active ? 'none' : 'width 180ms ease-out, opacity 180ms ease-out'
                    };
                };

                const getPotStatusTabTextClass = (status) => (
                    getPotStatusTabFillRatio(status) > 0.05 ? 'text-green-700' : 'text-gray-400 hover:text-gray-600'
                );

                const getPotStatusTabButtonClass = (status) => (
                    activePotStatus.value === status ? '' : 'hover:bg-gray-50'
                );

                const handlePotStatusSwipeStart = (event) => {
                    if (!canUsePotStatusSwipe() || event.touches.length !== 1) {
                        resetPotStatusSwipe();
                        return;
                    }

                    const touch = event.touches[0];
                    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
                    if (
                        touch.clientX < POT_STATUS_SWIPE_EDGE_GUARD ||
                        viewportWidth - touch.clientX < POT_STATUS_SWIPE_EDGE_GUARD
                    ) {
                        resetPotStatusSwipe();
                        return;
                    }

                    potStatusSwipe.tracking = true;
                    potStatusSwipe.active = false;
                    potStatusSwipe.startX = touch.clientX;
                    potStatusSwipe.startY = touch.clientY;
                    potStatusSwipe.source = activePotStatus.value;
                    potStatusSwipe.target = '';
                    potStatusSwipe.direction = 0;
                    potStatusSwipe.progress = 0;
                };

                const handlePotStatusSwipeMove = (event) => {
                    if (!potStatusSwipe.tracking || event.touches.length !== 1 || !canUsePotStatusSwipe()) {
                        resetPotStatusSwipe();
                        return;
                    }

                    const touch = event.touches[0];
                    const dx = touch.clientX - potStatusSwipe.startX;
                    const dy = touch.clientY - potStatusSwipe.startY;
                    const absDx = Math.abs(dx);
                    const absDy = Math.abs(dy);

                    if (absDx < 12) return;
                    if (absDx < absDy * POT_STATUS_SWIPE_RATIO) {
                        if (absDy > 16) resetPotStatusSwipe();
                        return;
                    }

                    const target = getPotStatusSwipeTarget(dx);
                    if (!target) {
                        resetPotStatusSwipe();
                        return;
                    }

                    if (event.cancelable) event.preventDefault();
                    potStatusSwipe.active = true;
                    potStatusSwipe.target = target;
                    potStatusSwipe.direction = dx < 0 ? 1 : -1;
                    potStatusSwipe.progress = Math.min(1, absDx / POT_STATUS_SWIPE_DISTANCE);
                };

                const handlePotStatusSwipeEnd = (event) => {
                    if (!potStatusSwipe.tracking) {
                        resetPotStatusSwipe();
                        return;
                    }

                    const shouldSwitch = (
                        potStatusSwipe.active &&
                        potStatusSwipe.target &&
                        potStatusSwipe.progress >= 1
                    );
                    const target = potStatusSwipe.target;

                    if (potStatusSwipe.active) {
                        potStatusSwipeSuppressClickUntil = Date.now() + 450;
                        if (event?.cancelable) event.preventDefault();
                    }

                    resetPotStatusSwipe();
                    if (shouldSwitch) {
                        setPotStatus(target);
                    }
                };

                const handlePotStatusSwipeCancel = () => {
                    resetPotStatusSwipe();
                };

                const handleHomeScroll = () => {
                    if (!hasMorePots.value || isLoadingMore.value || isEditMode.value || isLoading.value) return;
                    const remaining = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
                    if (remaining < 700) {
                        loadMorePots();
                    }
                };

                const fetchPotStatusCounts = async () => {
                    try {
                        const res = await apiClient.getPotStatusCounts();
                        if (res.success && res.data) {
                            potStatusCounts.active = Number(res.data.active || 0);
                            potStatusCounts.archived = Number(res.data.archived || 0);
                        }
                    } catch (error) {
                        console.debug('加载花盆状态数量失败:', error);
                    }
                };

                const setPotStatus = async (status) => {
                    resetPotStatusSwipe();
                    if (activePotStatus.value === status) return;
                    closePotActionSheet();
                    closeBatchActionSheet();
                    closeBatchCareModal();
                    closeBatchArchiveModal();
                    closeBatchInviteModal();
                    clearBatchSelection();
                    activePotStatus.value = status;
                    if (status !== 'active') {
                        showRemindersExpanded.value = false;
                    }
                    await fetchPots({ status, blocking: true });
                    if (status === 'active') {
                        await loadCareReminders();
                    }
                };

                const loadCareReminders = async () => {
                    if (activePotStatus.value !== 'active' || !isLoggedIn.value || !apiClient.userId) {
                        careReminders.value = [];
                        isCareRemindersLoading.value = false;
                        return;
                    }

                    try {
                        isCareRemindersLoading.value = true;
                        const res = await apiClient.getCareReminders();
                        if (res.success) {
                            careReminders.value = res.data || [];
                            // 加载完提醒后，为这些花盆加载季节性建议
                            setTimeout(loadSeasonalTips, 100);
                        }
                    } catch (e) {
                        careReminders.value = [];
                        const message = String(e?.message || '');
                        if (!message.includes('接口未命中或被静态页面接管') && !message.includes('接口返回了 HTML 页面')) {
                            console.debug('加载养护提醒失败:', e);
                        }
                    } finally {
                        isCareRemindersLoading.value = false;
                    }
                };

                const getPotActivityLabel = (pot) => {
                    const count = Number(pot?.new_activity_count || 0);
                    if (count > 1) return `${count}条新动态`;
                    return pot?.latest_activity_summary || '新动态';
                };

                const clearPotActivityMarker = (pot) => {
                    if (!pot) return;
                    pot.has_new_activity = 0;
                    pot.new_activity_count = 0;
                    pot.latest_activity_type = null;
                    pot.latest_activity_summary = null;
                    pot.latest_activity_at = null;
                };

                const markPotActivityReadBeforeOpen = (pot) => {
                    if (!pot?.id || !pot.has_new_activity) return;
                    clearPotActivityMarker(pot);
                };

                const goToPotDetail = (potId, options = {}) => {
                    const pot = pots.value.find(item => item.id === potId);
                    markPotActivityReadBeforeOpen(pot);
                    const params = new URLSearchParams({ id: String(potId) });
                    if (options.openSection) params.set('openSection', String(options.openSection));
                    if (options.careTab) params.set('careTab', String(options.careTab));
                    window.location.href = `pot-detail?${params.toString()}`;
                };

                const handleLogin = async () => {
                    try {
                        if (!await validateLoginForm()) {
                            return;
                        }
                        isAuthLoading.value = true;
                        clearStatus(loginStatus);
                        loginForm.email = formUtils.normalizeEmail(loginForm.email);
                        const res = await apiClient.login(loginForm.email, loginForm.password, loginForm.remember);
                        if (res.token) await completeAuthSuccess(buildUserFromAuthResponse(res));
                    } catch (e) {
                        loginStatus.type = 'error';
                        loginStatus.message = '登录失败: ' + e.message;
                    } finally { isAuthLoading.value = false; }
                };

                const handleForgotPassword = async () => {
                    syncLoginFormFromDom();
                    clearStatus(forgotPasswordStatus);
                    if (!validateForgotPasswordEmail(true)) {
                        await focusFieldById('forgotPasswordEmail');
                        return;
                    }
                    if (!forgotPasswordTurnstileToken.value) {
                        forgotPasswordStatus.type = 'error';
                        forgotPasswordStatus.message = '请先完成人机验证。';
                        await turnstileForms.render('forgotPassword');
                        return;
                    }
                    try {
                        isAuthLoading.value = true;
                        loginForm.email = formUtils.normalizeEmail(loginForm.email);
                        const res = await apiClient.forgotPassword(loginForm.email, forgotPasswordTurnstileToken.value);
                        if (res.success) {
                            forgotPasswordStatus.type = 'success';
                            forgotPasswordStatus.message = '重置链接已发送到您的邮箱，请检查收件箱和垃圾箱。';
                            loginStatus.type = 'success';
                            loginStatus.message = forgotPasswordStatus.message;
                            showForgotPasswordModal.value = false;
                            showLoginModal.value = true;
                        }
                    } catch (e) {
                        forgotPasswordStatus.type = 'error';
                        forgotPasswordStatus.message = '发送失败: ' + e.message;
                    } finally {
                        turnstileForms.reset('forgotPassword');
                        isAuthLoading.value = false;
                    }
                };

                const handleRegister = async () => {
                    if (!await validateRegisterForm()) {
                        return;
                    }
                    if (!registerTurnstileToken.value) {
                        registerStatus.type = 'error';
                        registerStatus.message = '请先完成人机验证。';
                        await turnstileForms.render('register');
                        return;
                    }

                    try {
                        isAuthLoading.value = true;
                        registerForm.email = formUtils.normalizeEmail(registerForm.email);
                        normalizeRegisterDisplayName();
                        clearStatus(registerStatus);
                        const anonymousUserId = window.authStorage?.getUserId() || null;
                        const isAnonymous = !user.value || user.value.userType === 'anonymous';

                        let res;
                        if (isAnonymous && anonymousUserId) {
                            res = await apiClient.upgrade(registerForm.email, registerForm.password, registerForm.displayName, anonymousUserId, registerTurnstileToken.value, registerForm.remember);
                        } else {
                            res = await apiClient.register(registerForm.email, registerForm.password, registerForm.displayName, registerTurnstileToken.value, registerForm.remember);
                        }

                        if (res.success || res.token) {
                            showAlert(isAnonymous ? '注册成功，您的匿名数据已合并！' : '注册成功！');
                            await completeAuthSuccess(buildUserFromAuthResponse(res));
                        }
                    } catch (e) {
                        registerStatus.type = 'error';
                        registerStatus.message = '注册失败: ' + e.message;
                    } finally {
                        turnstileForms.reset('register');
                        isAuthLoading.value = false;
                    }
                };

                const toggleSelectAll = () => {
                    const target = !allSelected.value;
                    const targetPots = isEditMode.value ? displayedPots.value : pots.value;
                    targetPots.forEach(p => p.selected = target);
                };

                const invertVisibleBatchSelection = () => {
                    if (!isEditMode.value || displayedPots.value.length === 0) return;
                    displayedPots.value.forEach(p => p.selected = !p.selected);
                };

                const resetBatchFilters = () => {
                    batchFilter.value = '';
                    batchFilterQuery.value = '';
                    showBatchFilterMenu.value = false;
                };

                // 切换管理模式
	                const toggleEditMode = async () => {
	                    closePotActionSheet();
	                    closePotSearch();
	                    isEditMode.value = !isEditMode.value;
	                    if (isEditMode.value) {
                            resetBatchFilters();
	                        showRemindersExpanded.value = false;
	                        if (activePotStatus.value === 'active' || activePotStatus.value === 'archived') {
	                            await loadAllRemainingPots();
	                            await nextTick();
                            initSortable();
                        }
                    } else {
                        clearBatchSelection();
                    }
                };

                const initSortable = () => {
                    if (!potsGrid.value) return;
                    loadSortableLibrary().then((SortableCtor) => {
                        if (!potsGrid.value || !isEditMode.value) return;
                        if (sortableInstance) sortableInstance.destroy();
                        sortableInstance = new SortableCtor(potsGrid.value, {
                            animation: 220, // 更贴手的回弹速度
                            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                            handle: '.handle',
                            delay: 0,
                            forceFallback: true, // 关键：使用fallback
                            fallbackClass: 'sortable-fallback',
                            ghostClass: 'sortable-ghost',
                            chosenClass: 'sortable-chosen',
                            dragClass: 'sortable-drag',
                            scroll: true,
                            scrollSensitivity: 50, // 增加滚动敏感区域
                            scrollSpeed: 20,
                            bubbleScroll: true,
                            fallbackTolerance: 3, // 防止误触
                            // 关键修改：禁用GPU加速，迫使Sortable使用top/left定位，
                            // 从而允许我们使用CSS transform: scale() 来制作“浮起”效果
                            // 如果开启GPU加速，Sortable会覆盖transform属性
                            gpuAcceleration: false,
                            onChoose: () => {
                                if (navigator.vibrate) navigator.vibrate(30);
                            },
                            onUnchoose: () => {
                                if (navigator.vibrate) navigator.vibrate(20);
                            },
                            onEnd: async (evt) => {
                                if (navigator.vibrate) navigator.vibrate(15);
                                const visibleBeforeMove = displayedPots.value.slice();
                                const item = visibleBeforeMove[evt.oldIndex];
                                const targetItem = visibleBeforeMove[evt.newIndex];
                                if (!item || !targetItem || item.id === targetItem.id) return;

                                const nextPots = pots.value.slice();
                                const fromIndex = nextPots.findIndex(p => p.id === item.id);
                                if (fromIndex < 0) return;
                                nextPots.splice(fromIndex, 1);

                                const targetIndex = nextPots.findIndex(p => p.id === targetItem.id);
                                if (targetIndex < 0) return;
                                const insertIndex = evt.newIndex > evt.oldIndex ? targetIndex + 1 : targetIndex;
                                nextPots.splice(insertIndex, 0, item);
                                pots.value = nextPots;
                                persistLocalPotOrder(activePotStatus.value);
                                try {
                                    await apiClient.reorderPots(ownedPots.value.map(p => p.id));
                                } catch (e) { console.error(e); }
                            }
                        });
                    }).catch((error) => console.error(error));
                };

                const destroySortable = () => {
                    if (sortableInstance) {
                        sortableInstance.destroy();
                        sortableInstance = null;
                    }
                };

                watch([batchFilter, batchFilterQuery], async () => {
                    if (!isEditMode.value) return;
                    await nextTick();
                    if (displayedPots.value.length > 0) {
                        initSortable();
                    } else {
                        destroySortable();
                    }
                });

                const requireSelectedOwnedPots = (emptyMessage) => batchActions.requireSelected({
                    items: selectedOwnedPots,
                    showAlert,
                    emptyMessage
                });

                const requireSelectedCareManageablePots = (emptyMessage) => batchActions.requireSelected({
                    items: selectedCareManageablePots,
                    showAlert,
                    emptyMessage
                });

                const requireSelectedViewerPots = (emptyMessage) => batchActions.requireSelected({
                    items: selectedViewerPots,
                    showAlert,
                    emptyMessage
                });

                const clearBatchSelection = () => {
                    resetBatchFilters();
                    closePotSearch();
                    batchActions.clearEditSelection({
                        pots,
                        isEditMode,
                        destroySortable
                    });
                };

                // 移除原有的 isBatchMode 监听

                const isOwnedPot = isOwnedPotData;
                const closePotActionSheet = () => {
                    if (showPotActionSheet.value) {
                        holdOverlayGuard();
                    }
                    showPotActionSheet.value = false;
                    activePotAction.value = null;
                };
                const openPotActionSheet = (pot) => {
                    if (Date.now() < potStatusSwipeSuppressClickUntil) return;
                    activePotAction.value = pot;
                    showPotActionSheet.value = true;
                };
                const handleCardClick = (pot) => {
                    if (Date.now() < potStatusSwipeSuppressClickUntil) return;
                    if (!isEditMode.value) {
                        markPotActivityReadBeforeOpen(pot);
                        window.location.href = `pot-detail?id=${pot.id}`;
                    }
                };
                const restoreArchivedPot = async (pot) => {
                    if (!pot?.id) return;
                    if (!showConfirm(`确定将 ${pot.name} 恢复到养护中吗？`)) return;
                    try {
                        const res = await apiClient.restorePot(pot.id);
                        if (res.success) {
                            await fetchPots({ status: 'archived', blocking: pots.value.length <= 1 });
                            await fetchPotStatusCounts();
                            showAlert('已恢复到养护中。');
                        }
                    } catch (e) {
                        showAlert('恢复失败: ' + e.message);
                    }
                };
                const restorePotFromSheet = async (pot) => {
                    closePotActionSheet();
                    await restoreArchivedPot(pot);
                };
                const goEditPotFromSheet = (potId) => {
                    closePotActionSheet();
                    window.location.href = `edit-pot?id=${potId}`;
                };
                const goAddCareForPot = (potId) => {
                    closePotActionSheet();
                    window.location.href = `care-record?potId=${potId}`;
                };
                const goAddTimelineForPot = (potId) => {
                    closePotActionSheet();
                    window.location.href = `pot-detail?id=${potId}&openTimeline=1`;
                };
                const openShareSettingsForPot = (potId) => {
                    closePotActionSheet();
                    window.location.href = `pot-detail?id=${potId}&openShare=1`;
                };
                const deletePotFromSheet = async (potId) => {
                    closePotActionSheet();
                    await confirmDeleteSingle(potId);
                };
                const leaveCollaborationFromSheet = async (pot) => {
                    closePotActionSheet();
                    await confirmLeaveCollaboration(pot);
                };
                const removeViewerPotFromSheet = async (pot) => {
                    closePotActionSheet();
                    await confirmLeaveViewer(pot);
                };

                const confirmLeaveCollaboration = async (pot) => {
                    if (showConfirm(`确定不再共同照料 ${pot.name} 吗？`)) {
                        try {
                            const res = await apiClient.leaveCollaboration(pot.id);
                            if (res.success) {
                                await fetchPots();
                            }
                        } catch (e) { showAlert('操作失败: ' + e.message); }
                    }
                };

                const confirmLeaveViewer = async (pot) => {
                    if (showConfirm(`确定将 ${pot.name} 从好友分享列表中移除吗？`)) {
                        try {
                            const res = await apiClient.leaveViewer(pot.id);
                            if (res.success) {
                                await fetchPots();
                                await fetchPotStatusCounts();
                            }
                        } catch (e) { showAlert('操作失败: ' + e.message); }
                    }
                };

                const deleteSelectedPots = async () => {
                    const toDelete = pots.value.filter(p => p.selected && !p.is_collaborator && !p.is_viewer);
                    const collabSelected = pots.value.filter(p => p.selected && p.is_collaborator);
                    const viewerSelected = pots.value.filter(p => p.selected && p.is_viewer && !p.is_collaborator);

                    let msg = activePotStatus.value === 'archived'
                        ? `确定要永久删除选中的 ${toDelete.length} 个已归档花盆吗？删除后无法恢复。`
                        : `确定要删除选中的 ${toDelete.length} 个花盆吗？`;
                    if (collabSelected.length > 0) {
                        msg += `\n(已自动排除 ${collabSelected.length} 个共同照料中的花盆)`;
                    }
                    if (viewerSelected.length > 0) {
                        msg += `\n(已自动排除 ${viewerSelected.length} 个仅查看的花盆)`;
                    }

                    if (toDelete.length > 0 && showConfirm(msg)) {
                        try {
                            isLoading.value = true;
                            for (const p of toDelete) await apiClient.deletePot(p.id);
                            await fetchPots({ status: activePotStatus.value, blocking: true });
                            await fetchPotStatusCounts();
                            clearBatchSelection();
                        } catch (e) { showAlert('删除失败'); } finally { isLoading.value = false; }
                    } else if (toDelete.length === 0 && (collabSelected.length > 0 || viewerSelected.length > 0)) {
                        showAlert('共同照料或仅查看的花盆不能批量删除，请从单盆菜单中选择“退出”或“移除”。');
                    }
                };

                const confirmDeleteSingle = async (id) => {
                    if (showConfirm('确定要删除吗？')) {
                        await apiClient.deletePot(id);
                        await fetchPots({ status: activePotStatus.value });
                        await fetchPotStatusCounts();
                    }
                };
                const logout = async () => { await apiClient.logout(); location.reload(); };
                const closeAuthModals = () => {
                    clearAuthFeedback();
                    showLoginModal.value = false;
                    showRegisterModal.value = false;
                    showForgotPasswordModal.value = false;
                };
                const switchToRegister = () => {
                    clearAuthFeedback();
                    showLoginModal.value = false;
                    showRegisterModal.value = true;
                    showForgotPasswordModal.value = false;
                };
                const switchToLogin = () => {
                    clearAuthFeedback();
                    showRegisterModal.value = false;
                    showLoginModal.value = true;
                    showForgotPasswordModal.value = false;
                };

                const seedDemoData = async () => {
                    try {
                        isAuthLoading.value = true;
                        const res = await apiClient.seedDemoData();
                        if (res.success) {
                            // 更新用户状态为匿名用户
                            user.value = { userType: 'anonymous' };
                            isLoggedIn.value = true;
                            await fetchPots();
                            if (navigator.vibrate) navigator.vibrate(50);
                        }
                    } catch (e) {
                        showAlert('生成失败: ' + e.message);
                    } finally {
                        isAuthLoading.value = false;
                    }
                };

                const switchToForgotPassword = () => {
                    clearAuthFeedback();
                    showLoginModal.value = false;
                    showForgotPasswordModal.value = true;
                };
                const normalizeReminderType = (careType, customAction = '') => {
                    const raw = String(careType || '').trim().toLowerCase();
                    if (['water', 'watering', 'change_water', 'water_change', 'changewater', '换水', '浇水'].includes(raw)) return 'water';
                    if (['fertilize', 'fertilizer', 'feed', '施肥'].includes(raw)) return 'fertilize';
                    if (['trim', 'prune', 'pruning', '修剪'].includes(raw)) return 'trim';
                    if (['repot', 're-pot', '换盆'].includes(raw)) return 'repot';
                    if (['pest', 'pests', '除虫', '病虫害'].includes(raw)) return 'pest';

                    const action = String(customAction || '').trim();
                    if (!action) return raw || 'custom';
                    if (/换水|浇水|补水/.test(action)) return 'water';
                    if (/施肥|追肥/.test(action)) return 'fertilize';
                    if (/修剪|打顶|摘心/.test(action)) return 'trim';
                    if (/换盆|翻盆/.test(action)) return 'repot';
                    if (/除虫|病虫害|杀虫/.test(action)) return 'pest';
                    return 'custom';
                };
                const getReminderTypeColor = (careType, customAction = '') => {
                    const type = normalizeReminderType(careType, customAction);
                    return {
                        water: 'text-blue-500',
                        fertilize: 'text-green-500',
                        trim: 'text-orange-500',
                        repot: 'text-purple-500',
                        pest: 'text-red-500',
                        custom: 'text-gray-500'
                    }[type] || 'text-gray-500';
                };
                const getReminderTypeIcon = (careType, customAction = '') => {
                    const type = normalizeReminderType(careType, customAction);
                    return {
                        water: 'fa-tint',
                        fertilize: 'fa-seedling',
                        trim: 'fa-cut',
                        repot: 'fa-exchange-alt',
                        pest: 'fa-bug',
                        custom: 'fa-clipboard-check'
                    }[type] || 'fa-clipboard-check';
                };
                const getReminderTypeLabel = (careType, customAction = '') => {
                    const type = normalizeReminderType(careType, customAction);
                    return {
                        water: '浇水',
                        fertilize: '施肥',
                        trim: '修剪',
                        repot: '换盆',
                        pest: '病虫害',
                        custom: '养护'
                    }[type] || '养护';
                };
                const getReminderDueStageColorClass = (reminder) => {
                    const intervalDays = Number(reminder?.intervalDays || 0);
                    const daysSinceCare = Number(reminder?.daysSinceCare || 0);
                    const overdueDays = daysSinceCare - intervalDays;
                    return overdueDays > 0 ? 'home-pot-due-icon--overdue' : 'home-pot-due-icon--due';
                };
                const formatDate = MyFlowerPotsDate.formatZhDate;
                const formatUtcDate = (dateStr) => MyFlowerPotsDate.formatUtcDateTime(dateStr, { fallback: '' });
                const formatGrowthDuration = (pot) => MyFlowerPotsDate.formatGrowthDuration({
                    ...pot,
                    status: pot?.status || activePotStatus.value || 'active'
                });
                const handleImageError = (e) => MyFlowerPotsMedia.setImageFallback(e);

                const imgUrl = MyFlowerPotsMedia.imgUrl;

                // 季节性提醒缓存
                const seasonalTipsMap = reactive({});

                const getCurrentSeason = () => {
                    const month = new Date().getMonth() + 1;
                    if (month >= 3 && month <= 5) return 'Spring';
                    if (month >= 6 && month <= 8) return 'Summer';
                    if (month >= 9 && month <= 11) return 'Autumn';
                    return 'Winter';
                };

                const applySeasonalMatchResult = (potId, res) => {
                    const plant = res?.data;
                    let guide = plant ? (plant.care_guide || plant.careGuide) : null;

                    if (typeof guide === 'string') {
                        try { guide = JSON.parse(guide); } catch (e) { console.warn('Parse guide failed', e); }
                    }

                    if (res?.success && guide) {
                        seasonalTipsMap[potId] = {
                            careGuide: guide,
                            season: getCurrentSeason()
                        };
                    }
                };

                // 获取并解析特定植物的季节性建议
                const fetchSeasonalTipForPot = async (potId, pName, pNote) => {
                    if (seasonalTipsMap[potId] !== undefined) return seasonalTipsMap[potId];

                    seasonalTipsMap[potId] = null;
                    try {
                        const res = await apiClient.smartMatchPlant(pName, pNote, { potId });
                        applySeasonalMatchResult(potId, res);
                    } catch (e) {
                        console.warn('Failed to fetch seasonal tip for', pName);
                    }
                    return seasonalTipsMap[potId];
                };

                const fetchSeasonalTipsForPots = async (potItems = []) => {
                    const items = potItems
                        .filter(p => p?.id && seasonalTipsMap[p.id] === undefined)
                        .map(p => ({
                            key: p.id,
                            potId: p.id,
                            potName: p.name,
                            potNote: p.note || ''
                        }));

                    if (items.length === 0) return;
                    items.forEach(item => { seasonalTipsMap[item.potId] = null; });

                    try {
                        const res = await apiClient.smartMatchPlants(items);
                        if (!res.success) return;
                        (res.data || []).forEach(item => {
                            const id = item.potId || item.key;
                            if (id) applySeasonalMatchResult(id, item);
                        });
                    } catch (e) {
                        console.warn('Failed to batch fetch seasonal tips:', e);
                    }
                };

                // 批量加载首页提醒的季节性建议
                const loadSeasonalTips = async () => {
                    // 依赖 pots.value 获取 note 信息
                    if (!pots.value || pots.value.length === 0) {
                        // 如果 pots 还没加载完，延迟重试
                        if (careReminders.value.length > 0) {
                            setTimeout(loadSeasonalTips, 500);
                        }
                        return;
                    }

                    const uniquePots = new Map();
                    groupedReminders.value.forEach(group => {
                        const fullPot = pots.value.find(p => p.id === group.potId);
                        if (fullPot) {
                            // 收集需要请求的花盆
                            if (seasonalTipsMap[group.potId] === undefined) {
                                uniquePots.set(group.potId, fullPot);
                            }
                        }
                    });

                    await fetchSeasonalTipsForPots(Array.from(uniquePots.values()));
                };

                // 从缓存中获取特定任务的建议文本
                const getTaskSeasonalTip = (potId, careType, customAction = '') => {
                    const data = seasonalTipsMap[potId];
                    if (!data || !data.careGuide) return null;

                    return extractSeasonalText(data.careGuide, normalizeReminderType(careType, customAction), data.season);
                };

                const extractSeasonalSnippet = (value, season, guideKey = null) => {
                    const seasonKeywords = {
                        Spring: ['春', '萌芽', '复苏', '生长'],
                        Summer: ['夏', '高温', '炎热'],
                        Autumn: ['秋', '凉', '落叶'],
                        Winter: ['冬', '寒', '休眠', '防冻']
                    };

                    const keywords = seasonKeywords[season];
                    const text = (value === null || value === undefined) ? '' : String(value);
                    if (text.length < 2) return null;

                    const segments = text.split(/[,，;；。.\n]/).filter(s => s.trim().length > 2);
                    for (const segment of segments) {
                        for (const kw of keywords) {
                            if (segment.includes(kw)) {
                                return { season, text: segment.trim(), guideKey };
                            }
                        }
                    }

                    return null;
                };

                const extractSeasonalText = (careGuide, careType, season) => {
                    try {
                        if (!careGuide || typeof careGuide !== 'object') return null;
                        const guideKey = {
                            water: 'watering',
                            fertilize: 'fertilizing',
                            trim: 'pruning',
                            repot: 'soilRequirement',
                            pest: 'pests'
                        }[careType];

                        if (!guideKey) return null;
                        return extractSeasonalSnippet(careGuide[guideKey], season, guideKey);
                    } catch (e) {
                        console.warn('Error extracting seasonal text:', e);
                    }
                    return null;
                };
                const extractAnySeasonalText = (careGuide, season) => {
                    if (!careGuide || typeof careGuide !== 'object') return null;

                    const guideKeys = ['watering', 'fertilizing', 'pruning', 'soilRequirement', 'pests'];
                    for (const key of guideKeys) {
                        const tip = extractSeasonalSnippet(careGuide[key], season, key);
                        if (tip?.text) {
                            return tip;
                        }
                    }

                    return null;
                };
                const loadHeaderSeasonalReminder = async () => {
                    seasonalHeaderReminders.value = [];
                    currentSeasonalHeaderIndex.value = 0;

                    if (!pots.value || pots.value.length === 0) {
                        return;
                    }

                    const reminders = [];
                    const seen = new Set();

                    const headerPots = pots.value.slice(0, 8);
                    await fetchSeasonalTipsForPots(headerPots);

                    for (const pot of headerPots) {
                        const data = seasonalTipsMap[pot.id];
                        const tip = data?.careGuide ? extractAnySeasonalText(data.careGuide, data.season) : null;
                        if (tip?.text) {
                            const key = `${pot.id}:${tip.text}`;
                            if (seen.has(key)) {
                                continue;
                            }

                            seen.add(key);
                            reminders.push({
                                potId: pot.id,
                                potName: pot.name,
                                season: tip.season,
                                text: tip.text,
                                guideKey: tip.guideKey
                            });
                        }

                        if (reminders.length >= 5) {
                            break;
                        }
                    }

                    seasonalHeaderReminders.value = reminders;
                };
                const restartSeasonalHeaderRotation = () => {
                    if (seasonalHeaderRotationTimer) {
                        clearInterval(seasonalHeaderRotationTimer);
                        seasonalHeaderRotationTimer = null;
                    }

                    const poolSize = navSeasonalReminderPool.value.length;
                    currentSeasonalHeaderIndex.value = 0;

                    if (poolSize > 1) {
                        seasonalHeaderRotationTimer = setInterval(() => {
                            currentSeasonalHeaderIndex.value = (currentSeasonalHeaderIndex.value + 1) % poolSize;
                        }, 4200);
                    }
                };
                const getSeasonalIcon = (season) => {
                    return {
                        Spring: 'fa-seedling',
                        Summer: 'fa-sun',
                        Autumn: 'fa-canadian-maple-leaf',
                        Winter: 'fa-snowflake'
                    }[season] || 'fa-leaf';
                };
                const getSeasonalTextClass = (season) => {
                    return {
                        Spring: 'text-green-700',
                        Summer: 'text-amber-700',
                        Autumn: 'text-orange-700',
                        Winter: 'text-sky-700'
                    }[season] || 'text-gray-700';
                };
                const getSeasonLabel = (season) => {
                    return {
                        Spring: '春季',
                        Summer: '夏季',
                        Autumn: '秋季',
                        Winter: '冬季'
                    }[season] || '当季';
                };
                const getSeasonalActionText = (guideKey, rawText, season) => {
                    const seasonLabel = getSeasonLabel(season);
                    const text = String(rawText || '');

                    if (guideKey === 'watering') {
                        if (/换水/.test(text)) return `${seasonLabel}及时换水`;
                        if (/控水|减少浇水|少浇|不过湿|偏干/.test(text)) return `${seasonLabel}注意控水`;
                        if (/补水|湿润|保湿/.test(text)) return `${seasonLabel}保持湿润`;
                        return `${seasonLabel}定期浇水`;
                    }

                    if (guideKey === 'fertilizing') {
                        if (/暂停|停止|减少施肥|少施肥/.test(text)) return `${seasonLabel}减少施肥`;
                        if (/补肥|追肥/.test(text)) return `${seasonLabel}少量补肥`;
                        return `${seasonLabel}适度施肥`;
                    }

                    if (guideKey === 'pruning') {
                        if (/整形|轻剪/.test(text)) return `${seasonLabel}轻剪整形`;
                        return `${seasonLabel}适当修剪`;
                    }

                    if (guideKey === 'soilRequirement') {
                        if (/换盆|翻盆/.test(text)) return `${seasonLabel}检查换盆`;
                        if (/盆土|土壤|基质|排水|根系/.test(text)) return `${seasonLabel}留意盆土`;
                        return `${seasonLabel}检查土壤`;
                    }

                    if (guideKey === 'pests') {
                        if (/通风/.test(text)) return `${seasonLabel}注意通风防虫`;
                        return `${seasonLabel}留意病虫害`;
                    }

                    return `${seasonLabel}留意养护`;
                };
                const formatSeasonalReminderText = (reminder) => {
                    if (!reminder) return '';
                    return getSeasonalActionText(reminder.guideKey, reminder.text, reminder.season);
                };
                const toggleSeasonalHeaderReminder = () => {
                    if (navSeasonalReminder.value?.potId) {
                        goToPotDetail(navSeasonalReminder.value.potId);
                    }
                };

                watch(
                    () => navSeasonalReminderPool.value.map(item => `${item.potId}:${item.text}`).join('|'),
                    () => {
                        restartSeasonalHeaderRotation();
                    }
                );

                const isBatchCareTypeSelected = (type) => batchCareForm.types.includes(type);

                const toggleBatchCareType = (type) => {
                    if (isBatchCareTypeSelected(type)) {
                        batchCareForm.types = batchCareForm.types.filter(item => item !== type);
                    } else {
                        batchCareForm.types = [...batchCareForm.types, type];
                    }
                    batchCareForm.type = batchCareForm.types[0] || '';
                };

                const selectedBatchCareActions = computed(() =>
                    batchCareForm.types.map(type => {
                        const option = batchCareTypeOptions.find(item => item.type === type);
                        return type === 'custom' ? batchCareForm.action.trim() : (option?.action || type);
                    })
                );

                const isBatchCareSubmitDisabled = computed(() =>
                    isBatchCareLoading.value ||
                    selectedCareManageableCount.value === 0 ||
                    batchCareForm.types.length === 0 ||
                    (isBatchCareTypeSelected('custom') && !batchCareForm.action.trim())
                );

                const openBatchCareModal = () => {
                    // 每次打开时重置日期为今天
                    batchCareForm.type = 'water';
                    batchCareForm.types = ['water'];
                    batchCareForm.action = '';
                    batchCareForm.careDate = MyFlowerPotsDate.getLocalDateString();
                    showBatchCareModal.value = true;
                };

                const closeBatchCareModal = () => {
                    if (showBatchCareModal.value) {
                        holdOverlayGuard();
                    }
                    showBatchCareModal.value = false;
                };

                const closeBatchArchiveModal = (options = {}) => {
                    if (isBatchArchiveLoading.value) return;
                    if (showBatchArchiveModal.value) {
                        holdOverlayGuard();
                    }
                    showBatchArchiveModal.value = false;
                    resetBatchArchiveForm();
                    if (!options.keepArchiveTarget) {
                        archiveTargetPot.value = null;
                    }
                };

                const closeBatchInviteModal = () => {
                    if (showBatchInviteModal.value) {
                        holdOverlayGuard();
                    }
                    showBatchInviteModal.value = false;
                };

	                const openBatchActionSheet = () => {
	                    showRemindersExpanded.value = false;
	                    showBatchActionSheet.value = true;
	                };

                const closeBatchActionSheet = () => {
                    if (showBatchActionSheet.value) {
                        holdOverlayGuard();
                    }
                    showBatchActionSheet.value = false;
                };

                const exitBatchMode = () => {
                    closeBatchActionSheet();
                    closeBatchCareModal();
                    closeBatchArchiveModal();
                    closeBatchInviteModal();
                    clearBatchSelection();
                };

                const openBatchCareFromSheet = () => {
                    if (!requireSelectedCareManageablePots('请先选择自有或共同照料花盆再批量养护。')) return;
                    closeBatchActionSheet();
                    openBatchCareModal();
                };

                const openArchiveModal = (targetPot = null) => {
                    resetBatchArchiveForm();
                    archiveTargetPot.value = targetPot;
                    showBatchArchiveModal.value = true;
                };

                const openBatchArchiveModal = () => {
                    openArchiveModal(null);
                };

                const openSingleArchiveFromSheet = (pot) => {
                    if (!isOwnedPot(pot) || activePotStatus.value !== 'active') return;
                    closePotActionSheet();
                    openArchiveModal(pot);
                };

                const openBatchArchiveFromSheet = () => {
                    if (!requireSelectedOwnedPots('请先选择自己拥有的花盆再批量归档。')) return;
                    closeBatchActionSheet();
                    openBatchArchiveModal();
                };

                const openBatchInviteModal = () => {
                    batchInviteForm.email = '';
                    batchInviteForm.method = 'email';
                    showBatchInviteModal.value = true;
                };

                const openBatchInviteFromSheet = () => {
                    if (!requireSelectedOwnedPots('请先选择自己拥有的花盆再批量邀请。')) return;
                    closeBatchActionSheet();
                    openBatchInviteModal();
                };

                const returnToBatchActionSheetFromCare = () => {
                    closeBatchCareModal();
                    openBatchActionSheet();
                };

                const archiveImageCount = () => MyFlowerPotsArchive.archiveImageCount(batchArchiveForm);

                const resetBatchArchiveForm = () => {
                    MyFlowerPotsArchive.resetArchiveForm(batchArchiveForm, archiveFileInput);
                };

                const triggerArchiveFileInput = () => {
                    archiveFileInput.value?.click();
                };

                const onArchiveFilesSelected = async (e) => {
                    await MyFlowerPotsArchive.selectArchiveImages(e, batchArchiveForm);
                };

                const removeArchiveImage = (idx) => {
                    batchArchiveForm.tempImages.splice(idx, 1);
                };

                const uploadArchiveImagesForPot = async (potId) => {
                    return MyFlowerPotsArchive.uploadArchiveImagesForPot(apiClient, batchArchiveForm, potId);
                };

                const uploadArchiveImagesByPotId = async (targetPots) => {
                    return MyFlowerPotsArchive.uploadArchiveImagesByPotId(apiClient, batchArchiveForm, targetPots);
                };

                const returnToBatchActionSheetFromArchive = () => {
                    if (isBatchArchiveLoading.value) return;
                    if (archiveTargetPot.value) {
                        const pot = archiveTargetPot.value;
                        closeBatchArchiveModal({ keepArchiveTarget: true });
                        openPotActionSheet(pot);
                        archiveTargetPot.value = null;
                        return;
                    }
                    closeBatchArchiveModal();
                    openBatchActionSheet();
                };

                const returnToBatchActionSheetFromInvite = () => {
                    closeBatchInviteModal();
                    openBatchActionSheet();
                };

                const deleteSelectedFromSheet = async () => {
                    if (!requireSelectedOwnedPots('当前选中项中没有可删除的自有花盆。')) return;
                    closeBatchActionSheet();
                    await deleteSelectedPots();
                };

                const restoreSelectedFromSheet = async () => {
                    const targetPots = requireSelectedOwnedPots('当前选中项中没有可恢复的归档花盆。');
                    if (!targetPots) return;
                    if (!showConfirm(`确定将选中的 ${targetPots.length} 个花盆恢复到养护中吗？`)) {
                        return;
                    }

                    try {
                        closeBatchActionSheet();
                        isLoading.value = true;
                        for (const pot of targetPots) {
                            await apiClient.restorePot(pot.id);
                        }
                        clearBatchSelection();
                        await fetchPots({ status: 'archived', blocking: true });
                        await fetchPotStatusCounts();
                        showAlert(`已恢复 ${targetPots.length} 个花盆。`);
                    } catch (e) {
                        showAlert('批量恢复失败: ' + e.message);
                    } finally {
                        isLoading.value = false;
                    }
                };

                const leaveSelectedViewersFromSheet = async () => {
                    const targetPots = requireSelectedViewerPots('当前选中项中没有可从列表移除的好友分享花盆。');
                    if (!targetPots) return;
                    if (!showConfirm(`确定将选中的 ${targetPots.length} 个花盆从好友分享列表中移除吗？`)) {
                        return;
                    }

                    try {
                        closeBatchActionSheet();
                        isLoading.value = true;
                        for (const pot of targetPots) {
                            await apiClient.leaveViewer(pot.id);
                        }
                        clearBatchSelection();
                        await fetchPots({ status: activePotStatus.value, blocking: true });
                        await fetchPotStatusCounts();
                        showAlert(`已从列表移除 ${targetPots.length} 个花盆。`);
                    } catch (e) {
                        showAlert('批量移除失败: ' + e.message);
                    } finally {
                        isLoading.value = false;
                    }
                };

                const submitBatchArchive = async () => {
                    const singleTarget = archiveTargetPot.value;
                    if (singleTarget) {
                        try {
                            isBatchArchiveLoading.value = true;
                            const imageUrls = await uploadArchiveImagesForPot(singleTarget.id);
                            const res = await apiClient.archivePot(singleTarget.id, {
                                reason: batchArchiveForm.reason,
                                note: batchArchiveForm.note.trim() || null,
                                imageUrls
                            });
                            if (res.success) {
                                showBatchArchiveModal.value = false;
                                archiveTargetPot.value = null;
                                resetBatchArchiveForm();
                                await fetchPots({ status: 'active', blocking: pots.value.length <= 1 });
                                await fetchPotStatusCounts();
                                await loadCareReminders();
                                showAlert('已归档。');
                            }
                        } catch (e) {
                            showAlert('归档失败: ' + e.message);
                        } finally {
                            isBatchArchiveLoading.value = false;
                        }
                        return;
                    }

                    const targetPots = requireSelectedOwnedPots('请先选择自己拥有的花盆再批量归档。');
                    if (!targetPots) return;

                    try {
                        isBatchArchiveLoading.value = true;
                        const archiveImagesByPotId = await uploadArchiveImagesByPotId(targetPots);
                        const res = await apiClient.batchArchivePots({
                            potIds: pots.value.filter(p => p.selected).map(p => p.id),
                            reason: batchArchiveForm.reason,
                            note: batchArchiveForm.note.trim() || null,
                            archiveImagesByPotId
                        });

                        if (res.success) {
                            const skipped = Number(res.skipped || 0);
                            const message = skipped > 0
                                ? `已归档 ${res.count} 个花盆，自动排除 ${skipped} 个非本人拥有的花盆。`
                                : `已归档 ${res.count} 个花盆。`;
                            showAlert(message);
                            showBatchArchiveModal.value = false;
                            showBatchActionSheet.value = false;
                            resetBatchArchiveForm();
                            clearBatchSelection();
                            await fetchPots({ status: 'active', blocking: true });
                            await fetchPotStatusCounts();
                            await loadCareReminders();
                        }
                    } catch (e) {
                        showAlert('批量归档失败: ' + e.message);
                    } finally {
                        isBatchArchiveLoading.value = false;
                    }
                };

                const submitBatchInvite = async () => {
                    const targetPots = requireSelectedOwnedPots('请先选择自己拥有的花盆再批量邀请。');
                    if (!targetPots) return;

                    const isViewerInvite = batchInviteForm.permission === 'viewer';
                    const inviteLabel = isViewerInvite ? '仅查看' : '共同照料';
                    const sendInvite = isViewerInvite
                        ? (potId, email) => apiClient.addViewer(potId, email)
                        : (potId, email) => apiClient.addCollaborator(potId, email);

                    try {
                        isBatchInviteLoading.value = true;
                        if (batchInviteForm.method === 'email') {
                            const email = formUtils.normalizeEmail(batchInviteForm.email);
                            if (!isBatchInviteEmailValid.value) {
                                showAlert('请输入正确的邮箱地址。');
                                return;
                            }

                            let successCount = 0;
                            let skippedCount = 0;
                            let failedCount = 0;
                            for (const item of targetPots) {
                                try {
                                    const res = await sendInvite(item.id, email);
                                    if (res.success) {
                                        successCount += 1;
                                    } else {
                                        failedCount += 1;
                                    }
                                } catch (e) {
                                    const message = e?.message || '';
                                    const isSkipMessage = isViewerInvite
                                        ? message.includes('already a viewer') || message.includes('already have edit access')
                                        : message.includes('already a collaborator');

                                    if (isSkipMessage) {
                                        skippedCount += 1;
                                    } else {
                                        failedCount += 1;
                                    }
                                }
                            }

                            showBatchInviteModal.value = false;
                            const successLabel = isViewerInvite ? '新增' : '新增或升级';
                            showAlert(`批量${inviteLabel}邀请已处理：${successLabel} ${successCount} 个，跳过 ${skippedCount} 个，失败 ${failedCount} 个。`);
                            return;
                        }

                        const res = await apiClient.createBatchInvite(
                            targetPots.map(item => item.id),
                            batchInviteForm.permission
                        );
                        const inviteUrl = res.data?.inviteUrl;
                        if (!res.success || !inviteUrl) {
                            showAlert('没有生成可复制的邀请链接。');
                            return;
                        }

                        const inviteText = [
                            `My Flower Pots 批量${inviteLabel}邀请`,
                            `包含 ${res.data?.potCount || targetPots.length} 个花盆`,
                            inviteUrl
                        ].join('\n');
                        const potCount = res.data?.potCount || targetPots.length;
                        const shareResult = await shareViaSystem({
                            title: `My Flower Pots 批量${inviteLabel}邀请`,
                            text: isViewerInvite
                                ? `邀请你一次查看 ${potCount} 个花盆的成长记录。`
                                : `邀请你一次加入 ${potCount} 个花盆的共同照料。`,
                            url: inviteUrl
                        });
                        if (shareResult.status === 'shared') {
                            showBatchInviteModal.value = false;
                            return;
                        }
                        if (shareResult.status === 'cancelled') {
                            return;
                        }

                        const isWeChat = /MicroMessenger/i.test(navigator.userAgent || '');
                        const copied = await copyTextSafely(inviteText);
                        showBatchInviteModal.value = false;
                        if (copied) {
                            showAlert(
                                isWeChat
                                    ? '批量邀请链接已复制！请点击微信右上角“...”选择“发送给朋友”进行分享。'
                                    : `已复制批量${inviteLabel}邀请链接，好友打开后会一次性处理这 ${potCount} 个花盆。`
                            );
                        } else {
                            showCopyFallback(
                                inviteText,
                                isWeChat
                                    ? '当前环境没能自动复制。系统已切到增强复制模式；你也可以点“再次复制”，然后通过微信右上角“...”分享：'
                                    : `批量${inviteLabel}邀请链接已生成。系统已切到增强复制模式；如果还没成功，可点“再次复制”：`
                            );
                        }
                    } catch (e) {
                        showAlert('批量邀请失败: ' + e.message);
                    } finally {
                        isBatchInviteLoading.value = false;
                    }
                };

                const submitBatchCare = async () => {
                    const selectedPots = requireSelectedCareManageablePots('请先选择自有或共同照料花盆再批量养护。');
                    if (!selectedPots) return;

                    const selectedTypes = [...batchCareForm.types];
                    const selectedActions = selectedBatchCareActions.value;
                    if (selectedTypes.length === 0) {
                        showAlert('请至少选择一个养护类型');
                        return;
                    }
                    if (selectedTypes.includes('custom') && !batchCareForm.action.trim()) {
                        showAlert('请填写自定义养护动作名称');
                        return;
                    }

                    try {
                        isBatchCareLoading.value = true;
                        const res = await apiClient.batchCreateCareRecord({
                            potIds: selectedPots.map(p => p.id),
                            type: selectedTypes[0],
                            types: selectedTypes,
                            action: selectedActions[0],
                            actions: selectedActions,
                            careDate: batchCareForm.careDate,
                            description: batchCareForm.description.trim() || null
                        });

                        if (res.success) {
                            const msg = res.skipped > 0
                                ? `已为 ${res.count} 个花盆记录养护（已自动跳过 ${res.skipped} 个无权限的花盆）`
                                : `已为 ${res.count} 个花盆记录 ${selectedTypes.length} 项养护`;
                            showAlert(msg);
                            showBatchCareModal.value = false;
                            // 退出管理模式并刷新列表
                            clearBatchSelection();
                            await fetchPots({ status: activePotStatus.value, blocking: false });
                            if (activePotStatus.value === 'active') {
                                await loadCareReminders();
                            }
                        }
                    } catch (e) {
                        showAlert('养护记录失败: ' + e.message);
                    } finally {
                        isBatchCareLoading.value = false;
                    }
                };

                onMounted(() => {
                    init();
                    window.addEventListener('scroll', handleHomeScroll, { passive: true });
                });

	                onUnmounted(() => {
	                    window.removeEventListener('scroll', handleHomeScroll);
	                    setAuthModalBodyLock(false);
	                    destroySortable();
	                });

                return {
                    isLoading, pots, displayedPots, isPotSearchEmpty, isBatchFilterEmpty, batchFilter, batchFilterQuery, showBatchFilterMenu, hasActiveBatchFilter, batchFilterOptions, setBatchFilter, clearBatchFilterFromMenu, searchFilter, showSearchFilterMenu, hasActiveSearchFilter, searchFilterOptions, setSearchFilter, clearSearchFilterFromMenu, toggleSearchFilterMenu, isPotSearchActive, potSearchQuery, potSearchInput, hasPotSearchQuery, openPotSearch, closePotSearch, clearPotSearch,
                    isLoadingMore, hasMorePots, loadMorePots, activePotStatus, potStatusTabs, potStatusCounts, showPotStatusSwitch, setPotStatus,
                    getPotStatusTabButtonClass, getPotStatusTabFillStyle, getPotStatusTabTextClass,
                    handlePotStatusSwipeStart, handlePotStatusSwipeMove, handlePotStatusSwipeEnd, handlePotStatusSwipeCancel,
                    emptyStateTitle, emptyStateMessage,
                    user, isLoggedIn, userDisplayName, navUserDisplayName, careReminders, isCareRemindersLoading, hasTopReminderBlock, groupedReminders, navSeasonalReminder, showRemindersExpanded, potDueTypeIconsMap,
                    ownedPots, collaborativePots, viewerPots, batchManageablePots,
                    isEditMode, potsGrid, showUserMenu, showLoginModal, showRegisterModal, showForgotPasswordModal, isAuthLoading,
                    entryNotice, entryNoticeClass, dismissEntryNotice,
                    loginForm, registerForm, loginErrors, registerErrors, forgotPasswordErrors, loginStatus, registerStatus, forgotPasswordStatus,
                    passwordsMatch, isLoginValid, isRegisterValid, isForgotPasswordEmailValid,
                    isTurnstileEnabled, isRegisterTurnstileReady, isForgotPasswordTurnstileReady,
                    allSelected, selectedCount,
                    selectedOwnedCount, selectedCareManageableCount, selectedViewerCount, selectedExcludedCount, selectedCareExcludedCount, isBatchInviteEmailValid, hasOverlayModalOpen,
	                    syncLoginFormFromDom, syncRegisterFormFromDom, scheduleLoginAutofillSync,
		                    keyboardModalStyle, authKeyboardModalStyle, isAuthKeyboardActive, authKeyboardMode,
		                    handleKeyboardFieldFocus, handleAuthKeyboardFieldFocus, handleAuthCompositionStart,
		                    handleAuthCompositionEnd, handleAuthFocusOut, submitAuthFormFromEnter,
                    validateLoginEmail, validateLoginPassword, validateForgotPasswordEmail,
                    validateRegisterEmail, validateRegisterPassword, validateRegisterConfirmPassword,
                    clearRegisterConfirmPassword,
                    handleLoginEmailInput, handleLoginPasswordInput, handleForgotPasswordEmailInput,
                    handleRegisterEmailInput, handleRegisterDisplayNameInput, handleRegisterPasswordInput, handleRegisterConfirmPasswordInput,
                    normalizeRegisterDisplayName,
                    handleLogin, handleRegister, handleForgotPassword, toggleSelectAll, invertVisibleBatchSelection, toggleEditMode, deleteSelectedPots,
                    handleCardClick, restoreArchivedPot, restorePotFromSheet, confirmDeleteSingle, showPotActionSheet, activePotAction, openPotActionSheet, closePotActionSheet,
                    isOwnedPot, goEditPotFromSheet, goAddCareForPot, goAddTimelineForPot, openShareSettingsForPot, openSingleArchiveFromSheet, deletePotFromSheet,
                    leaveCollaborationFromSheet, removeViewerPotFromSheet,
                    confirmLeaveCollaboration, confirmLeaveViewer,
                    logout, closeAuthModals, switchToRegister, switchToLogin, switchToForgotPassword,
                    formatDate, formatUtcDate, formatGrowthDuration, getPotActivityLabel, handleImageError, imgUrl, seedDemoData, goToPotDetail,
                    goEditPot: (id) => window.location.href = `edit-pot?id=${id}`,
                    goAddPot: () => window.location.href = 'add-pot',
                    goProfile: () => window.location.href = 'profile',
                    goAdmin: () => window.location.href = 'admin-plants',
                    // Seasonal
                    seasonalTipsMap,
                    getTaskSeasonalTip,
                    getSeasonalIcon,
                    formatSeasonalReminderText,
                    getSeasonalTextClass,
                    toggleSeasonalHeaderReminder,
                    getReminderTypeColor, getReminderTypeIcon, getReminderTypeLabel, getReminderDueStageColorClass,
                    loadSeasonalTips,
                    unreadCount,
                    supportUnreadCount,
                    notificationBadgeCount,
                    fetchUnreadCount,
                    fetchSupportUnreadCount,
                    showMessageCenter,
                    messagesList,
                    isMessagesLoading,
                    loginModalLead,
                    registerModalLead,
                    openMessageCenter,
                    markMessageRead,
                    handleMessageClick,
                    goToMessagePot,
                    handleMessageAction,
                    fetchMessages,
                    deleteMessage,
                    clearReadMessages,
                    messageTab,
                    filteredMessages,
                    // 批量养护
                    showBatchActionSheet, showBatchCareModal, isBatchCareLoading, batchCareForm,
                    openBatchActionSheet, closeBatchActionSheet, openBatchCareModal, closeBatchCareModal, openBatchCareFromSheet, returnToBatchActionSheetFromCare,
                    batchCareTypeOptions, isBatchCareTypeSelected, toggleBatchCareType, isBatchCareSubmitDisabled, submitBatchCare, exitBatchMode,
                    showBatchArchiveModal, isBatchArchiveLoading, batchArchiveForm, batchArchiveReasons, archiveTargetPot, archiveFileInput,
                    archiveImageCount, triggerArchiveFileInput, onArchiveFilesSelected, removeArchiveImage,
                    openBatchArchiveFromSheet, closeBatchArchiveModal, returnToBatchActionSheetFromArchive, submitBatchArchive,
                    showBatchInviteModal, isBatchInviteLoading, batchInviteForm,
                    openBatchInviteModal, closeBatchInviteModal, openBatchInviteFromSheet, returnToBatchActionSheetFromInvite, deleteSelectedFromSheet, restoreSelectedFromSheet, leaveSelectedViewersFromSheet, submitBatchInvite,
                    apiClient
                };
            }
        }).mount('#app');
