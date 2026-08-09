        const { createApp, ref, reactive, onMounted, onUnmounted, computed, watch, nextTick } = Vue;

        createApp({
            setup() {
                const formUtils = window.MyFlowerPotsFormUtils;
                const sectionNavUtils = window.MyFlowerPotsSectionNav;
                const showAlert = window.MyFlowerPotsDialog.alert;
                const showConfirm = window.MyFlowerPotsDialog.confirm;
                const isLoading = ref(true);
                const potId = ref(null);
                const shareToken = ref(null);
                const collabToken = ref(null);
                const viewerToken = ref(null);
                const pot = ref(null);
                const currentUser = ref(null);
                const careRecords = ref([]);
                const timelineRecords = ref([]);
                const unreadActivityEvents = ref([]);
                const confirmingDeleteId = ref(null);
                const collaborators = ref([]);
                const plantInfo = ref(null);
                const matchedPlantName = ref(null);
                const activeCareDate = ref(null);
                const showFullPlantInfo = ref(false);
                const showFullCareTips = ref(false);
                const plantInfoActiveTab = ref('basic');
                const potStats = ref(null);
                const collabInviteSessionId = ref(null);
                const viewerInviteSessionId = ref(null);
                const commentInputRef = ref(null);
                const keyboardViewport = formUtils.createKeyboardViewportController({
                    ref,
                    computed,
                    onMounted,
                    onUnmounted
                });
                const {
                    keyboardViewportHeight,
                    isCompactKeyboardViewport,
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

                // UI 状态
                const showPlantModal = ref(false);
                const showAddTimelineModal = ref(false);
                const showShareModal = ref(false);
                const showPublicShareModal = ref(false);
                const showPublicQrCode = ref(false);
                const isPublicShareLoading = ref(false);
                const showMembersModal = ref(false);
                const showMemberInviteModal = ref(false);
                const showCommentModal = ref(false);
                const showTransferModal = ref(false);
                const showArchiveModal = ref(false);
                const showAcceptTransferModal = ref(false);
                const transferToken = ref(null);
                const transferPot = ref(null);
                const isAcceptingTransfer = ref(false);
                const isTimelineDesc = ref(true);
                const transferEmail = ref('');
                const showTransferSuggestions = ref(false);
                const selectedTransferUser = ref(null);
                const viewerIsCollaborator = ref(false);
                const viewerIsViewer = ref(false);
                const isSubmittingComment = ref(false);
                const isArchiveLoading = ref(false);
                const showCommentDanmaku = ref(true);
                const potComments = ref([]);
                const replyTargetComment = ref(null);
                const pendingInvitePrompt = ref(null);
                const commentSortOrder = ref('asc');
                const barrageRotationSlot = ref(0);
                let barrageRotationTimer = null;
                const viewers = ref([]);
                const isPlantInfoLoading = ref(false);
                const isCareRecordsLoading = ref(false);
                const isTimelineRecordsLoading = ref(false);
                const isPotStatsLoading = ref(false);
                const isCareSchedulesLoading = ref(false);
                const isCommentsLoading = ref(false);
                const newCollaboratorEmail = ref('');
                const newViewerEmail = ref('');
                const memberInviteRole = ref('viewer');
                const activeMemberRole = ref('viewer');
                const memberInviteEmail = ref('');
                const isMemberInviteLoading = ref(false);
                const activeMemberMenuId = ref(null);
                const memberRoleUpdatingUserId = ref(null);
                const commentForm = reactive({
                    content: ''
                });
                const archiveReasons = ['枯萎', '烂根', '病虫害', '环境不适', '送人/不再养护', '其他'];
                const archiveForm = reactive({
                    reason: '枯萎',
                    note: '',
                    tempImages: []
                });

                const activeSection = ref('overview');
                const sectionNavigationActivationY = 120;
                let sectionNavigationObserver = null;
                let sectionNavigationFrame = null;
                const showActionMenu = ref(false);
                const actionMenuButton = ref(null);
                const actionMenuPanel = ref(null);
                const previewImages = ref([]);
                const previewIndex = ref(0);
                const galleryImageLoadToken = ref(0);
                const galleryDragOffset = ref(0);
                const galleryIsDragging = ref(false);
                const isSavingTimeline = ref(false);
                const fileInput = ref(null);
                const archiveFileInput = ref(null);
                const touchStartX = ref(0);
                const touchEndX = ref(0);
                const heroImageLoaded = ref(false);

                // Auth UI 状态
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
                        loginEmail: 'detailLoginEmail',
                        loginPassword: 'detailLoginPassword',
                        registerEmail: 'detailRegisterEmail',
                        registerDisplayName: 'detailRegisterNickname',
                        registerPassword: 'detailRegisterPassword',
                        registerConfirmPassword: 'detailRegisterConfirmPassword',
                        forgotPasswordEmail: 'detailForgotPasswordEmail'
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
                const turnstileForms = window.createTurnstileController({
                    ref,
                    computed,
                    nextTick,
                    contexts: {
                        register: { containerId: 'detailRegisterTurnstile', action: 'register' },
                        forgotPassword: { containerId: 'detailForgotPasswordTurnstile', action: 'forgot_password' }
                    }
                });
                const isTurnstileEnabled = turnstileForms.isEnabled;
                const registerTurnstileToken = turnstileForms.tokenFor('register');
                const forgotPasswordTurnstileToken = turnstileForms.tokenFor('forgotPassword');
                const isRegisterTurnstileReady = turnstileForms.isReady('register');
                const isForgotPasswordTurnstileReady = turnstileForms.isReady('forgotPassword');

                const isCollaboratorInviteEmailValid = computed(() => formUtils.isValidEmail(newCollaboratorEmail.value));
                const isViewerInviteEmailValid = computed(() => formUtils.isValidEmail(newViewerEmail.value));
                const isTransferEmailValid = computed(() => !transferEmail.value.trim() || formUtils.isValidEmail(transferEmail.value));

                const hasEmailAuthSession = () => {
                    const tokenType = apiClient.parseTokenPayload?.()?.type;
                    return currentUser.value?.userType === 'email' || tokenType === 'email';
                };
                const fallbackPotImage = 'assets/images/icons/icons-default-pot.png';

                const newTimeline = reactive({
                    date: MyFlowerPotsDate.getLocalDateString(),
                    description: '',
                    existingImages: [],
                    tempImages: []
                });
                const editingTimelineId = ref(null);
                const isEditingTimeline = computed(() => !!editingTimelineId.value);

                const careSchedules = ref([]);
                const carePanelActiveTab = ref('records');
                const showScheduleExpanded = ref(true);
                const showAddScheduleModal = ref(false);
                const editingScheduleId = ref(null);
                const newSchedule = reactive({
                    careType: 'water',
                    customAction: '',
                    intervalDays: 7
                });
                const isEditingSchedule = computed(() => !!editingScheduleId.value);
                const scheduleModalTitle = computed(() => isEditingSchedule.value ? '修改养护提醒' : '设置养护提醒');
                const scheduleModalConfirmLabel = computed(() => isEditingSchedule.value ? '保存修改' : '确认添加');

                const scheduleTypeOptions = [
                    { value: 'water', iconClass: 'fa-tint', label: '浇水' },
                    { value: 'fertilize', iconClass: 'fa-seedling', label: '施肥' },
                    { value: 'trim', iconClass: 'fa-cut', label: '修剪' },
                    { value: 'repot', iconClass: 'fa-exchange-alt', label: '换盆' },
                    { value: 'pest', iconClass: 'fa-bug', label: '除虫' },
                    { value: 'custom', iconClass: 'fa-sliders-h', label: '自定义' }
                ];
                const scheduleIntervalPresets = [
                    { days: 3, label: '每 3 天' },
                    { days: 7, label: '每 7 天' },
                    { days: 14, label: '每 14 天' },
                    { days: 30, label: '每月' }
                ];

                const sectionTabs = computed(() => {
                    const tabs = [
                        { key: 'overview', label: '概览', id: 'section-overview' },
                        { key: 'records', label: '养护历史', id: 'section-records' },
                        { key: 'timelines', label: '生长轨迹', id: 'section-timelines' }
                    ];
                    return tabs;
                });

                // 核心权限逻辑
                // 确保 user_id 存在且匹配，防止 undefined === undefined 的误判
                const isOwner = computed(() => {
                    return pot.value && pot.value.user_id &&
                        currentUser.value && currentUser.value.id &&
                        pot.value.user_id === currentUser.value.id;
                });
                const isArchived = computed(() => MyFlowerPotsPotPermissions.isArchivedPot(pot.value));
                const isReadOnly = computed(() => !!(isArchived.value || (!!shareToken.value && !isOwner.value && !viewerIsCollaborator.value) || pot.value?.is_viewer || viewerIsViewer.value));
                const isPublicVisitor = computed(() => !!shareToken.value && !currentUser.value);
                const canShowCareSchedules = computed(() => !!(
                    pot.value &&
                    !isPublicVisitor.value &&
                    !isArchived.value &&
                    (
                        isOwner.value ||
                        pot.value.is_collaborator ||
                        viewerIsCollaborator.value
                    )
                ));
                watch(canShowCareSchedules, (canShow) => {
                    if (!canShow && carePanelActiveTab.value === 'schedules') {
                        carePanelActiveTab.value = 'records';
                    }
                });
                const showOperatorName = computed(() => !!(!shareToken.value && pot.value && (pot.value.is_collaborator || pot.value.collaborator_count > 0)));
                const hasCollaborationAccess = computed(() => !!(isOwner.value || pot.value?.is_collaborator || viewerIsCollaborator.value));
                const canCommentAsMember = computed(() => !!(
                    currentUser.value && pot.value && (
                        isOwner.value ||
                        pot.value.is_collaborator ||
                        viewerIsCollaborator.value ||
                        pot.value.is_viewer ||
                        viewerIsViewer.value
                    )
                ));
                const canReplyComment = computed(() =>
                    MyFlowerPotsCommentBarrage.canReplyComment({
                        canCommentAsMember: canCommentAsMember.value,
                        isPublicVisitor: isPublicVisitor.value,
                        isArchived: isArchived.value
                    })
                );
                const hasCommentAudience = computed(() =>
                    MyFlowerPotsCommentBarrage.hasCommentAudience({
                        pot: pot.value,
                        comments: potComments.value,
                        viewerIsCollaborator: viewerIsCollaborator.value,
                        viewerIsViewer: viewerIsViewer.value
                    })
                );
                const canManageCommentDanmaku = computed(() => !!(isOwner.value && hasCommentAudience.value && !isArchived.value));
                const canUseNativeShare = computed(() => !!(
                    typeof window !== 'undefined' &&
                    window.isSecureContext !== false &&
                    typeof navigator !== 'undefined' &&
                    typeof navigator.share === 'function'
                ));
                const collaboratorCount = computed(() => {
                    const loadedCount = Number(collaborators.value?.length || 0);
                    return loadedCount || Number(pot.value?.collaborator_count || 0);
                });
                const viewerCount = computed(() => {
                    const loadedCount = Number(viewers.value?.length || 0);
                    return loadedCount || Number(pot.value?.viewer_count || 0);
                });
                const memberTotalCount = computed(() => {
                    if (isArchived.value) {
                        return viewerCount.value;
                    }
                    return collaboratorCount.value + viewerCount.value;
                });
                const shareAccessIconClassMap = {
                    public: 'fa-link',
                    viewer: 'fa-book-open',
                    collaborator: 'fa-handshake'
                };
                const shareAccessStates = computed(() => MyFlowerPotsPotPermissions.getShareAccessStates({
                    isShared: !!pot.value?.is_shared,
                    isArchived: isArchived.value,
                    viewerCount: viewerCount.value,
                    collaboratorCount: collaboratorCount.value
                }).map((state) => ({
                    ...state,
                    icon: shareAccessIconClassMap[state.key] || state.icon
                })));
                const activeMembers = computed(() => (
                    activeMemberRole.value === 'collaborator' ? collaborators.value : viewers.value
                ));
                const activeMemberRoleLabel = computed(() => (
                    activeMemberRole.value === 'collaborator' ? '共同照料成员' : '仅查看成员'
                ));
                const activeMemberRoleShortLabel = computed(() => (
                    activeMemberRole.value === 'collaborator' ? '共同照料' : '仅查看'
                ));
                const activeMemberDescription = computed(() => (
                    activeMemberRole.value === 'collaborator'
                        ? '可新增和编辑养护、时间线、提醒'
                        : (isArchived.value ? '可查看归档记录，不能编辑' : '可查看记录和留言，不能编辑')
                ));
                const activeMemberEmptyText = computed(() => (
                    activeMemberRole.value === 'collaborator' ? '暂无共同照料成员' : '暂无仅查看成员'
                ));
                const activeMemberInviteButtonLabel = computed(() => (
                    activeMemberRole.value === 'collaborator' ? '邀请或添加共同照料' : '邀请或添加仅查看'
                ));
                const isMemberInviteEmailValid = computed(() => formUtils.isValidEmail(memberInviteEmail.value));
                const memberInviteDescription = computed(() => {
                    if (memberInviteRole.value === 'collaborator') {
                        return '可新增和编辑养护、时间线、提醒';
                    }
                    return isArchived.value ? '可查看归档记录，不能编辑' : '可查看记录，不能编辑';
                });
                const memberInviteEmailButtonLabel = computed(() => (
                    memberInviteRole.value === 'collaborator' ? '添加共同照料' : '添加仅查看'
                ));
                const memberInviteLinkButtonLabel = computed(() => (
                    memberInviteRole.value === 'collaborator' ? '分享协作链接' : '分享查看链接'
                ));
                const memberInviteLinkDescription = computed(() => (
                    memberInviteRole.value === 'collaborator'
                        ? '点击按钮会优先调用系统分享，不可用时会自动复制邀请链接给好友。'
                        : '点击按钮会优先调用系统分享，不可用时会自动复制查看链接给好友。'
                ));
                const memberInviteLinkExpiryText = computed(() => (
                    memberInviteRole.value === 'collaborator'
                        ? '邀请链接默认 24 小时内有效。'
                        : '分享链接默认 24 小时内有效。'
                ));
                const shouldHideFloatingChrome = computed(() => !!(
                    showPlantModal.value ||
                    showAddTimelineModal.value ||
                    showShareModal.value ||
                    showPublicShareModal.value ||
                    showMembersModal.value ||
                    showMemberInviteModal.value ||
                    showCommentModal.value ||
                    showTransferModal.value ||
                    showAcceptTransferModal.value
                ));
                const showCommentEntry = computed(() => !!(hasCommentAudience.value && canReplyComment.value));
                const canLeaveComment = computed(() => canReplyComment.value);
                const isCompactCommentViewport = computed(() => isCompactKeyboardViewport.value);
                const canViewCommentDanmaku = computed(() => !!(
                    hasCommentAudience.value && (
                        showCommentEntry.value ||
                        !!pot.value?.is_viewer ||
                        !!viewerIsViewer.value ||
                        !!pot.value?.is_collaborator ||
                        !!viewerIsCollaborator.value ||
                        !!isOwner.value
                    )
                ));
                const commentModalStyle = computed(() => {
                    const rawHeight = keyboardViewportHeight.value || (typeof window !== 'undefined' ? window.innerHeight : 0);
                    const viewportHeight = Math.max(rawHeight || 0, 360);
                    const spacing = isCompactCommentViewport.value ? 8 : 32;
                    const maxHeight = Math.max(viewportHeight - spacing, 360);
                    return {
                        maxHeight: `min(${maxHeight}px, 56rem)`
                    };
                });
                const shouldShowCommentDanmaku = computed(() => !!(canViewCommentDanmaku.value && Number(pot.value?.show_comment_danmaku ?? 1) === 1 && showCommentDanmaku.value));
                const recentPotComments = computed(() => {
                    const sorted = [...(potComments.value || [])].sort((a, b) => {
                        const timeA = new Date(a.createdAt || 0).getTime();
                        const timeB = new Date(b.createdAt || 0).getTime();
                        return commentSortOrder.value === 'asc' ? timeA - timeB : timeB - timeA;
                    });
                    return commentSortOrder.value === 'asc' ? sorted.slice(-12) : sorted.slice(0, 12);
                });
                const barrageComments = computed(() => {
                    return (potComments.value || []).slice(-8).map((item, idx) =>
                        MyFlowerPotsCommentBarrage.buildBarrageComment(item, idx, {
                            rotationSlot: barrageRotationSlot.value
                        })
                    );
                });

                const syncUrlWithShareStatus = () => {
                    if (!isOwner.value || !pot.value) return;
                    const url = new URL(window.location.href);
                    if (isArchived.value) {
                        if (!url.searchParams.has('id') || url.searchParams.has('token')) {
                            url.searchParams.set('id', pot.value.id);
                            url.searchParams.delete('token');
                            window.history.replaceState({}, '', url.toString());
                        }
                        return;
                    }
                    if (pot.value.is_shared && pot.value.share_token) {
                        // 开启了分享：确保 URL 使用 token 模式，方便微信抓取分享
                        if (url.searchParams.get('token') !== pot.value.share_token) {
                            url.searchParams.set('token', pot.value.share_token);
                            url.searchParams.delete('id');
                            window.history.replaceState({}, '', url.toString());
                        }
                    } else if (pot.value.is_shared === false || pot.value.is_shared === 0) {
                        // 关闭了分享：回退到私有 id 模式
                        if (!url.searchParams.has('id')) {
                            url.searchParams.set('id', pot.value.id);
                            url.searchParams.delete('token');
                            window.history.replaceState({}, '', url.toString());
                        }
                    }
                };

                const maybeOpenShareModalFromUrl = () => {
                    const shouldOpenShare = getParamWithFallback('openShare') === '1';
                    if (!shouldOpenShare) return;

                    const url = new URL(window.location.href);
                    if (url.searchParams.has('openShare')) {
                        url.searchParams.delete('openShare');
                        window.history.replaceState({}, '', url.toString());
                    }

                    if (pot.value && isOwner.value) {
                        showShareModal.value = true;
                    }
                };

                const maybeOpenTimelineModalFromUrl = () => {
                    const shouldOpenTimeline = getParamWithFallback('openTimeline') === '1';
                    if (!shouldOpenTimeline) return;

                    const url = new URL(window.location.href);
                    if (url.searchParams.has('openTimeline')) {
                        url.searchParams.delete('openTimeline');
                        window.history.replaceState({}, '', url.toString());
                    }

                    if (!pot.value || isReadOnly.value || showShareModal.value) return;
                    openAddTimelineModal();
                };

                const maybeFocusCareSectionFromUrl = () => {
                    const openSection = getParamWithFallback('openSection');
                    const careTab = getParamWithFallback('careTab');
                    const shouldFocusRecords = openSection === 'records';
                    const shouldOpenSchedules = careTab === 'schedules';

                    if (!shouldFocusRecords && !shouldOpenSchedules) return;

                    const url = new URL(window.location.href);
                    if (url.searchParams.has('openSection')) {
                        url.searchParams.delete('openSection');
                        window.history.replaceState({}, '', url.toString());
                    }
                    if (url.searchParams.has('careTab')) {
                        url.searchParams.delete('careTab');
                        window.history.replaceState({}, '', url.toString());
                    }

                    if (!pot.value) return;

                    if (shouldOpenSchedules && canShowCareSchedules.value) {
                        carePanelActiveTab.value = 'schedules';
                    } else if (shouldFocusRecords) {
                        carePanelActiveTab.value = 'records';
                    }

                    nextTick(() => {
                        scrollToSection('section-records', 'records');
                    });
                };

                const getDirectParam = (name) => {
                    const url = new URL(window.location.href);
                    const fromSearch = url.searchParams.get(name);
                    if (fromSearch) return fromSearch;

                    const hash = window.location.hash?.startsWith('#')
                        ? window.location.hash.slice(1)
                        : window.location.hash || '';
                    if (hash) {
                        const hashParams = new URLSearchParams(hash);
                        const fromHash = hashParams.get(name);
                        if (fromHash) return fromHash;
                    }
                    return null;
                };

                const shouldUseStoredInviteToken = () => !(
                    getDirectParam('id') ||
                    getDirectParam('token') ||
                    getDirectParam('transferToken')
                );

                const getParamWithFallback = (name) => {
                    const directValue = getDirectParam(name);
                    if (directValue) return directValue;

                    if (!shouldUseStoredInviteToken()) {
                        return null;
                    }

                    if (name === 'collabToken') {
                        return sessionStorage.getItem('pending_collab_token');
                    }
                    if (name === 'viewerToken') {
                        return sessionStorage.getItem('pending_viewer_token');
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

                const isAuthRequiredError = (err) => {
                    const status = Number(err?.status || 0);
                    const rawMessage = String(err?.message || '').trim();
                    return status === 401 || /Authentication required/i.test(rawMessage);
                };

                const clearPendingInviteState = (type) => {
                    if (!type || type === 'collab') {
                        sessionStorage.removeItem('pending_collab_token');
                        sessionStorage.removeItem('collab_invite_session_id');
                    }
                    if (!type || type === 'viewer') {
                        sessionStorage.removeItem('pending_viewer_token');
                        sessionStorage.removeItem('viewer_invite_session_id');
                    }
                };

                const redirectToErrorPage = (type, message, options = {}) => {
                    const nav = window.MyFlowerPotsNavigation;
                    const redirect = nav?.getCurrentAppPath?.() || `${window.location.pathname.split('/').pop() || 'pot-detail'}${window.location.search}${window.location.hash}`;

                    const params = {
                        type,
                        redirect,
                        message,
                        from: 'pot-detail',
                        source: options.source || type,
                        open: options.open,
                        auto: options.auto
                    };

                    if (nav?.redirectToError) {
                        nav.redirectToError(params, { replace: true });
                        return true;
                    }

                    const search = new URLSearchParams();
                    Object.entries(params).forEach(([key, value]) => {
                        if (value === undefined || value === null) return;
                        const normalized = String(value).trim();
                        if (normalized) search.set(key, normalized);
                    });
                    window.location.replace(`error?${search.toString()}`);
                    return true;
                };

                const handleInitError = (err) => {
                    const status = Number(err?.status || 0);
                    const rawMessage = (err?.message || '').trim();

                    if (status === 401 || /Authentication required/i.test(rawMessage)) {
                        redirectToErrorPage('login_required', rawMessage || '这个花盆需要登录后才能继续查看。', { open: 'login' });
                        return;
                    }

                    if ((collabToken.value || viewerToken.value) && /Invite link invalid or expired/i.test(rawMessage)) {
                        const needsLogin = !hasEmailAuthSession();
                        if (redirectToErrorPage(
                            needsLogin ? 'login_required' : 'link_expired',
                            needsLogin ? '请先登录或注册后继续处理这条邀请。' : '这条邀请链接已经失效，请让好友重新发送最新入口。',
                            { open: needsLogin ? 'login' : undefined }
                        )) {
                            return;
                        }
                    }

                    if (!shareToken.value && potId.value && (status === 404 || /not found/i.test(rawMessage))) {
                        redirectToErrorPage('not_found', '没有找到这盆花，可能它已被删除，或者当前入口已经变化。');
                        return;
                    }

                    if (!shareToken.value && potId.value && (status === 403 || /access denied/i.test(rawMessage))) {
                        const message = hasEmailAuthSession()
                            ? '这个花盆不存在，或当前账号没有查看权限。请切换到正确账号后再试。'
                            : '这个花盆不存在，或需要登录正确账号后才能查看。您也可以先注册一个账号。';
                        redirectToErrorPage(hasEmailAuthSession() ? 'forbidden' : 'login_required', message, { open: 'login' });
                        return;
                    }

                    if (shareToken.value) {
                        redirectToErrorPage('link_expired', rawMessage || '当前分享链接已经失效，请让对方重新发送最新入口。');
                        return;
                    }

                    redirectToErrorPage('server_error', rawMessage || '页面暂时没加载出来，请稍后重试。');
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

                const normalizeUnreadActivityEvents = (events) => {
                    if (!Array.isArray(events)) return [];
                    return events.map(event => ({
                        id: Number(event?.id || 0),
                        type: String(event?.type || ''),
                        summary: event?.summary || '',
                        createdAt: event?.createdAt || event?.created_at || null,
                        targetType: event?.targetType || event?.target_type || null,
                        targetId: event?.targetId == null && event?.target_id == null
                            ? null
                            : String(event?.targetId ?? event?.target_id)
                    })).filter(event => event.type);
                };

                const markCurrentPotActivityRead = async () => {
                    if (!potId.value || shareToken.value || !apiClient.token || !apiClient.userId) return;
                    try {
                        const res = await apiClient.markPotActivityRead(potId.value);
                        unreadActivityEvents.value = normalizeUnreadActivityEvents(res?.data?.unreadEvents);
                    } catch (error) {
                        console.debug('标记花盆动态已读失败:', error);
                    }
                };

                const goHome = () => {
                    window.location.href = '/';
                };

                const applyCurrentUserProfile = (userRes) => {
                    currentUser.value = userRes?.success ? userRes.user : null;
                };

                const canLoadPrivateDetailData = () => !!(
                    pot.value && (
                        !shareToken.value ||
                        isOwner.value ||
                        viewerIsCollaborator.value ||
                        viewerIsViewer.value ||
                        pot.value.is_collaborator ||
                        pot.value.is_viewer
                    )
                );

                const runWhenIdle = (callback, timeout = 250) => {
                    if (typeof window.requestIdleCallback === 'function') {
                        window.requestIdleCallback(callback, { timeout: 1200 });
                        return;
                    }
                    window.setTimeout(callback, timeout);
                };

                const startBackgroundDetailLoads = () => {
                    if (!pot.value) return;

                    runWhenIdle(() => {
                        if (canLoadPrivateDetailData()) {
                            loadDetailBundle().catch(err => {
                                if (!isOwner.value && err.message?.includes('Authentication')) {
                                    console.warn('Skipping private detail bundle for non-owner');
                                } else {
                                    console.error('Detail bundle load error:', err);
                                }
                            });
                        }

                        loadPlantInfo().catch(err => console.warn('Plant info load error:', err));
                        if (!canLoadPrivateDetailData()) {
                            loadPotComments().catch(err => console.warn('Comment load error:', err));
                        }
                    });
                };

                const init = async () => {
                    potId.value = getParamWithFallback('id');
                    shareToken.value = getParamWithFallback('token');
                    collabToken.value = getParamWithFallback('collabToken');
                    viewerToken.value = getParamWithFallback('viewerToken');
                    transferToken.value = getParamWithFallback('transferToken');
                    unreadActivityEvents.value = [];

                    if (collabToken.value) {
                        sessionStorage.setItem('pending_collab_token', collabToken.value);
                        getInviteSessionId('collab_invite_session_id', collabInviteSessionId);
                    }
                    if (viewerToken.value) {
                        sessionStorage.setItem('pending_viewer_token', viewerToken.value);
                        getInviteSessionId('viewer_invite_session_id', viewerInviteSessionId);
                    }

                    pot.value = null;
                    currentUser.value = null;
                    transferPot.value = null;
                    careRecords.value = [];
                    timelineRecords.value = [];
                    potStats.value = null;
                    careSchedules.value = [];
                    plantInfo.value = null;
                    matchedPlantName.value = null;
                    potComments.value = [];
                    pendingInvitePrompt.value = null;
                    viewerIsCollaborator.value = false;
                    viewerIsViewer.value = false;
                    showCommentDanmaku.value = true;
                    isPlantInfoLoading.value = false;
                    isCareRecordsLoading.value = false;
                    isTimelineRecordsLoading.value = false;
                    isPotStatsLoading.value = false;
                    isCareSchedulesLoading.value = false;
                    isCommentsLoading.value = false;

                    try {
                        const userProfilePromise = (apiClient.token && apiClient.userId)
                            ? apiClient.getUserProfile().catch(() => null)
                            : Promise.resolve(null);

                        if (transferToken.value) {
                            const [userRes] = await Promise.all([
                                userProfilePromise,
                                loadTransferPotDetail()
                            ]);
                            applyCurrentUserProfile(userRes);
                        } else if (collabToken.value) {
                            applyCurrentUserProfile(await userProfilePromise);
                            if (hasEmailAuthSession() && await tryResumeCollaboratorInviteFromLink()) {
                                return;
                            }
                            try {
                                const inviteData = await openCollaboratorInviteLink();
                                if (!hasEmailAuthSession()) {
                                    isLoading.value = false;
                                    prepareInviteLoginPrompt('collab', inviteData);
                                    return;
                                }
                            } catch (inviteOpenError) {
                                if (hasEmailAuthSession() && await tryResumeCollaboratorInviteFromLink()) {
                                    return;
                                }
                                throw inviteOpenError;
                            }
                            await acceptCollaboratorInviteFromLink();
                        } else if (viewerToken.value) {
                            applyCurrentUserProfile(await userProfilePromise);
                            if (hasEmailAuthSession() && await tryResumeViewerInviteFromLink()) {
                                return;
                            }
                            try {
                                const inviteData = await openViewerInviteLink();
                                if (!hasEmailAuthSession()) {
                                    isLoading.value = false;
                                    prepareInviteLoginPrompt('viewer', inviteData);
                                    return;
                                }
                            } catch (inviteOpenError) {
                                if (hasEmailAuthSession() && await tryResumeViewerInviteFromLink()) {
                                    return;
                                }
                                throw inviteOpenError;
                            }
                            await acceptViewerInviteFromLink();
                        } else if (shareToken.value) {
                            const [userRes] = await Promise.all([
                                userProfilePromise,
                                loadPublicPotDetail()
                            ]);
                            applyCurrentUserProfile(userRes);
                        } else if (potId.value) {
                            const [userRes] = await Promise.all([
                                userProfilePromise,
                                loadPotDetailWithPublicFallback()
                            ]);
                            applyCurrentUserProfile(userRes);
                        } else {
                            isLoading.value = false;
                            redirectToErrorPage('not_found', '当前链接缺少必要参数，请从首页或最新入口重新进入。');
                            return;
                        }

                        isLoading.value = false;

                        if (pot.value) {
                            startBackgroundDetailLoads();
                        }
                    } catch (err) {
                        if (!isAuthRequiredError(err)) {
                            if (collabToken.value) clearPendingInviteState('collab');
                            if (viewerToken.value) clearPendingInviteState('viewer');
                        }
                        handleInitError(err);
                        isLoading.value = false;
                    } finally {
                        // 无论成功失败，尝试同步一次 URL（如果是主人且已加载 pot）
                        syncUrlWithShareStatus();
                        maybeOpenShareModalFromUrl();
                        maybeOpenTimelineModalFromUrl();
                        maybeFocusCareSectionFromUrl();
                    }
                };

                const syncCommentDanmakuStateFromPot = () => {
                    showCommentDanmaku.value = Number(pot.value?.show_comment_danmaku ?? 1) === 1;
                };

                const syncShareMetadata = () => {
                    if (!pot.value?.name) return;
                    const title = `${pot.value.name} - 我的花盆`;
                    document.title = title;
                    document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
                    document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', title);
                };

                const loadPotDetail = async () => {
                    const res = await apiClient.getPotDetail(potId.value);
                    if (res.success) {
                        pot.value = res.data;
                        syncCommentDanmakuStateFromPot();
                        syncShareMetadata();
                        await markCurrentPotActivityRead();
                    }
                };

                const canTryPublicIdFallback = (err) => {
                    const status = Number(err?.status || 0);
                    const rawMessage = String(err?.message || '');
                    return !!potId.value && (
                        status === 401 ||
                        status === 403 ||
                        status === 404 ||
                        /Authentication required|access denied|not found/i.test(rawMessage)
                    );
                };

                const applyPublicPotDetail = (data) => {
                    unreadActivityEvents.value = [];
                    pot.value = data.pot;
                    if (pot.value?.share_token) {
                        shareToken.value = pot.value.share_token;
                    }
                    syncCommentDanmakuStateFromPot();
                    syncShareMetadata();
                    potId.value = pot.value.id;
                    viewerIsCollaborator.value = !!data.viewer?.isCollaborator;
                    viewerIsViewer.value = !!data.viewer?.isViewer;
                    if (data.careRecords) careRecords.value = data.careRecords;
                    if (data.timelines) timelineRecords.value = data.timelines;
                };

                const loadPotDetailWithPublicFallback = async () => {
                    try {
                        await loadPotDetail();
                    } catch (err) {
                        if (!canTryPublicIdFallback(err)) throw err;
                        try {
                            const res = await apiClient.getPublicPotDetailById(potId.value);
                            if (res.success) {
                                applyPublicPotDetail(res.data);
                                return;
                            }
                        } catch {
                            // Keep the original private-detail error so the existing guide remains accurate.
                        }
                        throw err;
                    }
                };

                const loadPublicPotDetail = async () => {
                    try {
                        const res = await apiClient.getPublicPotDetail(shareToken.value);
                        if (res.success) {
                            // 公开分享接口已包含脱敏后的记录，直接使用
                            applyPublicPotDetail(res.data);
                        }
                    } catch (err) {
                        throw err; // 继续向上抛出，让 init 的 catch 停止 isLoading
                    }
                };

                const loadTransferPotDetail = async () => {
                    const res = await apiClient.getTransferPotDetail(transferToken.value);
                    if (res.success) {
                        transferPot.value = res.data.data;
                        showAcceptTransferModal.value = true;
                    }
                };

                const acceptCollaboratorInviteFromLink = async () => {
                    try {
                        const res = await apiClient.acceptCollaboratorInvite(collabToken.value, getInviteSessionId('collab_invite_session_id', collabInviteSessionId));
                        if (res.success && res.data?.potId) {
                            clearPendingInviteState('collab');
                            window.location.replace(`pot-detail?id=${res.data.potId}`);
                            return true;
                        }
                    } catch (e) {
                        throw e;
                    }
                    return false;
                };

                const openCollaboratorInviteLink = async () => {
                    const res = await apiClient.openCollaboratorInvite(collabToken.value, getInviteSessionId('collab_invite_session_id', collabInviteSessionId));
                    return res?.data || null;
                };

                const tryResumeCollaboratorInviteFromLink = async () => {
                    try {
                        return await acceptCollaboratorInviteFromLink();
                    } catch (error) {
                        console.warn('Failed to resume collaborator invite:', error);
                        return false;
                    }
                };

                const acceptViewerInviteFromLink = async () => {
                    try {
                        const res = await apiClient.acceptViewerInvite(viewerToken.value, getInviteSessionId('viewer_invite_session_id', viewerInviteSessionId));
                        if (res.success && res.data?.potId) {
                            clearPendingInviteState('viewer');
                            window.location.replace(`pot-detail?id=${res.data.potId}`);
                            return true;
                        }
                    } catch (e) {
                        throw e;
                    }
                    return false;
                };

                const openViewerInviteLink = async () => {
                    const res = await apiClient.openViewerInvite(viewerToken.value, getInviteSessionId('viewer_invite_session_id', viewerInviteSessionId));
                    return res?.data || null;
                };

                const tryResumeViewerInviteFromLink = async () => {
                    try {
                        return await acceptViewerInviteFromLink();
                    } catch (error) {
                        console.warn('Failed to resume viewer invite:', error);
                        return false;
                    }
                };

                const handleInviteAuthSuccess = async () => {
                    if (collabToken.value) {
                        await acceptCollaboratorInviteFromLink();
                        return true;
                    }
                    if (viewerToken.value) {
                        await acceptViewerInviteFromLink();
                        return true;
                    }
                    return false;
                };

                const acceptTransfer = async (token = null) => {
                    const tToken = token || transferToken.value;
                    if (!currentUser.value) {
                        showAlert('请先登录后再接收转让');
                        showLoginModal.value = true;
                        return;
                    }
                    try {
                        isAcceptingTransfer.value = true;
                        const res = await apiClient.acceptTransfer(tToken);
                        if (res.success) {
                            showAlert('接收成功！您现在是该花盆的主人了。');
                            window.location.href = `pot-detail?id=${pot.value.id}`;
                        }
                    } catch (e) {
                        showAlert('接收失败: ' + e.message);
                    } finally {
                        isAcceptingTransfer.value = false;
                    }
                };

                const rejectTransfer = async (token = null) => {
                    const tToken = token || transferToken.value;
                    if (!showConfirm('确定要拒绝本次移交吗？')) return;
                    try {
                        const res = await apiClient.rejectTransfer(tToken);
                        if (res.success) {
                            showAlert('已拒绝移交');
                            window.location.href = '/';
                        }
                    } catch (e) { showAlert('操作失败: ' + e.message); }
                };

                const cancelTransfer = async () => {
                    if (!showConfirm('确定要撤销本次移交申请吗？')) return;
                    try {
                        const res = await apiClient.cancelTransfer(potId.value);
                        if (res.success) {
                            showAlert('移交已撤销');
                            loadPotDetail();
                        }
                    } catch (e) { showAlert('撤销失败: ' + e.message); }
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
                        if (res.token) {
                            try {
                                if (await handleInviteAuthSuccess()) return;
                            } catch (inviteError) {
                                handleInitError(inviteError);
                                return;
                            }
                            location.reload();
                        }
                    } catch (e) {
                        loginStatus.type = 'error';
                        loginStatus.message = '登录失败: ' + e.message;
                    } finally { isAuthLoading.value = false; }
                };

                const handleForgotPassword = async () => {
                    syncLoginFormFromDom();
                    clearStatus(forgotPasswordStatus);
                    if (!validateForgotPasswordEmail(true)) {
                        await focusFieldById('detailForgotPasswordEmail');
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
                        const isAnonymous = !currentUser.value || currentUser.value.userType === 'anonymous';

                        let res;
                        if (isAnonymous && anonymousUserId) {
                            res = await apiClient.upgrade(registerForm.email, registerForm.password, registerForm.displayName, anonymousUserId, registerTurnstileToken.value, registerForm.remember);
                        } else {
                            res = await apiClient.register(registerForm.email, registerForm.password, registerForm.displayName, registerTurnstileToken.value, registerForm.remember);
                        }

                        if (res.success || res.token) {
                            try {
                                if (await handleInviteAuthSuccess()) return;
                            } catch (inviteError) {
                                handleInitError(inviteError);
                                return;
                            }
                            showAlert(isAnonymous ? '注册成功，您的匿名数据已合并！' : '注册成功！');
                            location.reload();
                        }
                    } catch (e) {
                        registerStatus.type = 'error';
                        registerStatus.message = '注册失败: ' + e.message;
                    } finally {
                        turnstileForms.reset('register');
                        isAuthLoading.value = false;
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
                const redirectInviteAuthFallback = (open) => {
                    const nav = window.MyFlowerPotsNavigation;
                    if (!nav?.redirectToIndex) return;
                    nav.redirectToIndex({
                        open,
                        notice: 'login_required',
                        redirect: nav.getCurrentAppPath?.() || 'pot-detail',
                        source: 'invite'
                    });
                };
                const openInviteLogin = async () => {
                    clearAuthFeedback();
                    showRegisterModal.value = false;
                    showForgotPasswordModal.value = false;
                    showLoginModal.value = true;
                    if (isCompactKeyboardViewport.value) {
                        await nextTick();
                    } else {
                        await focusFieldById('detailLoginEmail', { scrollIntoView: false });
                    }
                    if (!document.getElementById('detailLoginEmail')) {
                        redirectInviteAuthFallback('login');
                    }
                };
                const openInviteRegister = async () => {
                    clearAuthFeedback();
                    showLoginModal.value = false;
                    showForgotPasswordModal.value = false;
                    showRegisterModal.value = true;
                    if (isCompactKeyboardViewport.value) {
                        await nextTick();
                    } else {
                        await focusFieldById('detailRegisterEmail', { scrollIntoView: false });
                    }
                    if (!document.getElementById('detailRegisterEmail')) {
                        redirectInviteAuthFallback('register');
                    }
                };
                const switchToForgotPassword = () => {
                    clearAuthFeedback();
                    showLoginModal.value = false;
                    showForgotPasswordModal.value = true;
                };

                const syncActiveCareDetails = () => {
                    if (!activeCareDate.value) return;
                    const group = groupedCareRecords.value.find(g => g.date === activeCareDate.value);
                    if (group && group.records.length > 0) {
                        currentSheetGroup.value = { ...group };
                    } else {
                        closeCareDetails();
                    }
                };

                const normalizeScheduleInterval = (value) => {
                    const days = Number(value);
                    if (!Number.isFinite(days)) return 7;
                    return Math.max(1, Math.min(365, Math.round(days)));
                };

                const normalizeCareSchedules = (items = []) => items.map(s => ({
                    ...s,
                    intervalDays: normalizeScheduleInterval(s.interval_days ?? s.intervalDays),
                    scheduleLastCare: s.schedule_last_care ?? s.scheduleLastCare ?? s.lastCare ?? s.last_care ?? null,
                    enabled: s.enabled === 1 || s.enabled === true
                }));

                const setNewScheduleInterval = (days) => {
                    newSchedule.intervalDays = normalizeScheduleInterval(days);
                };

                const adjustNewScheduleInterval = (delta) => {
                    setNewScheduleInterval(Number(newSchedule.intervalDays || 7) + delta);
                };

                const resetNewScheduleForm = () => {
                    newSchedule.careType = 'water';
                    newSchedule.customAction = '';
                    newSchedule.intervalDays = 7;
                };

                const mapScheduleCareTypeToOption = (type, customAction = '') => {
                    const normalized = normalizeCareType(type, customAction);
                    if (normalized === 'prune') return 'trim';
                    if (['water', 'fertilize', 'trim', 'repot', 'pest'].includes(normalized)) return normalized;
                    return 'custom';
                };

                const closeScheduleModal = () => {
                    showAddScheduleModal.value = false;
                    editingScheduleId.value = null;
                    resetNewScheduleForm();
                };

                const openAddScheduleModal = () => {
                    if (isReadOnly.value) return;
                    editingScheduleId.value = null;
                    resetNewScheduleForm();
                    showAddScheduleModal.value = true;
                };

                const openEditScheduleModal = (schedule) => {
                    if (isReadOnly.value || !schedule?.id) return;
                    editingScheduleId.value = schedule.id;
                    newSchedule.careType = mapScheduleCareTypeToOption(schedule.care_type, schedule.custom_action);
                    newSchedule.customAction = String(schedule.custom_action || '').trim();
                    newSchedule.intervalDays = normalizeScheduleInterval(schedule.intervalDays ?? schedule.interval_days);
                    showAddScheduleModal.value = true;
                };

                const getScheduleStartDate = (schedule = null) => {
                    const parseCalendarDay = MyFlowerPotsDate?.parseCalendarDay;
                    const scheduleCreatedDate = parseCalendarDay?.(schedule?.created_at ?? schedule?.createdAt);
                    const scheduleLastCareDate = parseCalendarDay?.(
                        schedule?.scheduleLastCare
                        ?? schedule?.schedule_last_care
                        ?? schedule?.lastCare
                        ?? schedule?.last_care
                    );
                    return scheduleLastCareDate
                        || scheduleCreatedDate
                        || parseCalendarDay?.(pot.value?.plant_date)
                        || parseCalendarDay?.(new Date())
                        || new Date();
                };

                const getCalendarDayDiff = (startDate, endDate) => {
                    const dayMs = 24 * 60 * 60 * 1000;
                    return Math.floor((endDate.getTime() - startDate.getTime()) / dayMs);
                };

                const formatScheduleStatusLabel = (daysUntilDue, overdueDays) => {
                    if (daysUntilDue < 0) return `逾期 ${overdueDays} 天`;
                    if (daysUntilDue === 0) return '今天';
                    if (daysUntilDue === 1) return '明天';
                    if (daysUntilDue === 2) return '后天';
                    return `${daysUntilDue} 天后`;
                };

                const getScheduleProgressMeta = (schedule) => {
                    const intervalDays = normalizeScheduleInterval(schedule?.intervalDays ?? schedule?.interval_days);
                    const today = MyFlowerPotsDate?.parseCalendarDay?.(new Date()) || new Date();
                    const startDate = getScheduleStartDate(schedule);
                    const elapsedDays = getCalendarDayDiff(startDate, today);
                    const daysUntilDue = intervalDays - elapsedDays;
                    const overdueDays = Math.max(0, Math.abs(daysUntilDue));
                    const remainingRatio = daysUntilDue > 0 ? Math.min(1, daysUntilDue / intervalDays) : 0;
                    const isPaused = !schedule?.enabled;

                    if (isPaused) {
                        return {
                            label: '已暂停',
                            progress: 0,
                            urgencyKey: 'comfortable',
                            fillClass: 'care-schedule-fill--muted',
                            statusClass: 'care-schedule-status--muted',
                            sortValue: Number.POSITIVE_INFINITY,
                            isPaused
                        };
                    }

                    const urgencyKey = daysUntilDue <= 0 || remainingRatio < 0.25
                        ? 'urgent'
                        : remainingRatio <= 0.5
                            ? 'soon'
                            : 'comfortable';
                    const fillClass = {
                        urgent: 'care-schedule-fill--red',
                        soon: 'care-schedule-fill--amber',
                        comfortable: 'care-schedule-fill--green'
                    }[urgencyKey];
                    const statusClass = {
                        urgent: 'care-schedule-status--urgent',
                        soon: 'care-schedule-status--soon',
                        comfortable: 'care-schedule-status--comfortable'
                    }[urgencyKey];

                    return {
                        label: formatScheduleStatusLabel(daysUntilDue, overdueDays),
                        progress: daysUntilDue <= 0 ? 8 : Math.max(10, Math.round(remainingRatio * 100)),
                        urgencyKey,
                        fillClass,
                        statusClass,
                        sortValue: daysUntilDue,
                        isPaused
                    };
                };

                const groupedCareScheduleCards = computed(() => {
                    const groupDefinitions = [
                        { key: 'urgent', label: '紧急' },
                        { key: 'soon', label: '临近' },
                        { key: 'comfortable', label: '充裕' }
                    ];
                    const groups = new Map(groupDefinitions.map(group => [group.key, []]));

                    careSchedules.value.forEach(schedule => {
                        const meta = getScheduleProgressMeta(schedule);
                        const typeStyle = getScheduleTypeStyle(schedule.care_type, schedule.custom_action);
                        const card = {
                            schedule,
                            meta,
                            typeStyle,
                            name: getScheduleTypeName(schedule.care_type, schedule.custom_action)
                        };
                        groups.get(meta.urgencyKey)?.push(card);
                    });

                    return groupDefinitions
                        .map(group => ({
                            ...group,
                            items: (groups.get(group.key) || []).sort((a, b) => a.meta.sortValue - b.meta.sortValue)
                        }))
                        .filter(group => group.items.length > 0);
                });

                const applyDetailBundleData = (data = {}) => {
                    if (data.careRecords) {
                        careRecords.value = data.careRecords;
                        syncActiveCareDetails();
                    }
                    if (data.timelineRecords || data.timelines) {
                        timelineRecords.value = data.timelineRecords || data.timelines || [];
                    }
                    if (data.potStats) {
                        potStats.value = data.potStats;
                    }
                    if (data.careSchedules) {
                        careSchedules.value = canShowCareSchedules.value
                            ? normalizeCareSchedules(data.careSchedules)
                            : [];
                    } else if (!canShowCareSchedules.value) {
                        careSchedules.value = [];
                    }
                    if (data.potComments) {
                        potComments.value = data.potComments;
                    }
                };

                const loadDetailBundle = async () => {
                    if (!potId.value) return;
                    isCareRecordsLoading.value = true;
                    isTimelineRecordsLoading.value = true;
                    isPotStatsLoading.value = true;
                    isCareSchedulesLoading.value = !!canShowCareSchedules.value;
                    isCommentsLoading.value = true;
                    try {
                        const res = await apiClient.getPotDetailBundle(potId.value);
                        if (res.success && res.data) {
                            applyDetailBundleData(res.data);
                        }
                    } finally {
                        isCareRecordsLoading.value = false;
                        isTimelineRecordsLoading.value = false;
                        isPotStatsLoading.value = false;
                        isCareSchedulesLoading.value = false;
                        isCommentsLoading.value = false;
                    }
                };

                const loadCareRecords = async () => {
                    if (!potId.value) {
                        careRecords.value = [];
                        return;
                    }
                    isCareRecordsLoading.value = true;
                    try {
                        const res = await apiClient.getCareRecords(potId.value);
                        if (res.success) {
                            careRecords.value = res.data || [];
                            syncActiveCareDetails();
                        }
                    } finally {
                        isCareRecordsLoading.value = false;
                    }
                };

                const loadTimelineRecords = async () => {
                    if (!potId.value) {
                        timelineRecords.value = [];
                        return;
                    }
                    isTimelineRecordsLoading.value = true;
                    try {
                        const res = await apiClient.getTimelines(potId.value, { limit: 10 });
                        if (res.success) timelineRecords.value = res.data || [];
                    } finally {
                        isTimelineRecordsLoading.value = false;
                    }
                };

                const loadPotStats = async () => {
                    if (!potId.value) {
                        potStats.value = null;
                        return;
                    }
                    isPotStatsLoading.value = true;
                    try {
                        const res = await apiClient.getPotStats(potId.value);
                        if (res.success) potStats.value = res.data;
                    } finally {
                        isPotStatsLoading.value = false;
                    }
                };

                const loadCareSchedules = async () => {
                    if (!potId.value || !canShowCareSchedules.value) {
                        careSchedules.value = [];
                        return;
                    }
                    isCareSchedulesLoading.value = true;
                    try {
                        const res = await apiClient.getCareSchedules(potId.value);
                        if (res.success && res.data) {
                            careSchedules.value = normalizeCareSchedules(res.data);
                        }
                    } finally {
                        isCareSchedulesLoading.value = false;
                    }
                };

                const loadPlantInfo = async () => {
                    if (!pot.value?.name) {
                        plantInfo.value = null;
                        matchedPlantName.value = null;
                        return;
                    }
                    isPlantInfoLoading.value = true;
                    try {
                        const matchRes = await apiClient.smartMatchPlant(pot.value.name, pot.value.note || '', {
                            potId: pot.value.id
                        });
                        if (matchRes.success && matchRes.data) {
                            plantInfo.value = transformPlantData(matchRes.data);
                            if (matchRes.data.name !== pot.value.name) matchedPlantName.value = matchRes.data.name;
                        }
                    } catch (e) {
                        console.warn('Plant match failed', e);
                    } finally {
                        isPlantInfoLoading.value = false;
                    }
                };

                const transformPlantData = (d) => {
                    const safeParse = (val) => {
                        if (!val) return {};
                        if (typeof val === 'string') { try { return JSON.parse(val); } catch (e) { return {}; } }
                        return val;
                    };
                    return {
                        basicInfo: safeParse(d.basic_info || d.basicInfo),
                        ornamentalFeatures: safeParse(d.ornamental_features || d.ornamentalFeatures),
                        careGuide: safeParse(d.care_guide || d.careGuide)
                    };
                };

                // --- 辅助函数 ---
                const normalizeCareType = MyFlowerPotsCare.normalizeCareType;
                const getCareTypeIcon = MyFlowerPotsCare.getCareTypeIcon;
                const getCareTypeColor = MyFlowerPotsCare.getCareTypeColor;
                const getCareTypeLabel = (type, action = '') =>
                    MyFlowerPotsCare.getCareTypeLabel(type, action, { fallback: '日常' });
                const getImages = MyFlowerPotsMedia.parseImageList;

                const groupedCareRecords = computed(() => {
                    if (!careRecords.value || !careRecords.value.length) return [];
                    const groups = {};
                    careRecords.value.forEach(r => {
                        const d = formatDate(r.care_date || r.date);
                        if (!groups[d]) groups[d] = [];
                        groups[d].push(r);
                    });

                    return Object.keys(groups)
                        .sort((a, b) => new Date(b) - new Date(a))
                        .map(date => {
                            const list = groups[date];
                            const actions = [...new Set(list.map(i => getCareTypeLabel(i.type, i.action)))];
                            const descriptions = list.map(i => i.description).filter(Boolean);
                            return {
                                date,
                                records: list,
                                displayAction: actions.join('、'),
                                displayDescription: descriptions.length > 0 ? descriptions[0] : ''
                            };
                        });
                });

                const currentSheetGroup = computed(() => {
                    if (!activeCareDate.value) return null;
                    return groupedCareRecords.value.find(g => g.date === activeCareDate.value);
                });

                const showCareDetails = (group) => {
                    activeCareDate.value = group.date;
                };

                const closeCareDetails = () => {
                    activeCareDate.value = null;
                };

                const goAddCarePageWithDate = (date) => {
                    if (isReadOnly.value) return;
                    window.location.href = `care-record?potId=${potId.value}&date=${date}`;
                };

                const sortedTimelineRecords = computed(() => {
                    return [...timelineRecords.value].sort((a, b) => {
                        const dateA = new Date(a.date);
                        const dateB = new Date(b.date);
                        return isTimelineDesc.value ? dateB - dateA : dateA - dateB;
                    });
                });

                const unreadTimelineEvents = computed(() => (
                    unreadActivityEvents.value.filter(event => event.targetType === 'timeline' && event.targetId)
                ));

                const unreadTimelineEventMap = computed(() => {
                    const map = new Map();
                    unreadTimelineEvents.value.forEach(event => {
                        if (!map.has(event.targetId)) map.set(event.targetId, event);
                    });
                    return map;
                });

                const visibleTimelineRecords = computed(() => {
                    const sorted = sortedTimelineRecords.value;
                    const visible = sorted.slice(0, 3);
                    const visibleIds = new Set(visible.map(record => String(record.id)));
                    unreadTimelineEvents.value.forEach(event => {
                        if (visibleIds.has(event.targetId)) return;
                        const record = sorted.find(item => String(item.id) === event.targetId);
                        if (!record) return;
                        visible.push(record);
                        visibleIds.add(event.targetId);
                    });
                    return visible;
                });

                const isTimelineActivityNew = (record) => unreadTimelineEventMap.value.has(String(record?.id));

                const getTimelineActivityLabel = (record) => {
                    const event = unreadTimelineEventMap.value.get(String(record?.id));
                    if (!event) return '';
                    return event.summary || (event.type === 'timeline_updated' ? '更新成长轨迹' : '新动态');
                };

                const detailActivityNoticeEvents = computed(() => (
                    unreadActivityEvents.value.filter(event => (
                        !(event.targetType === 'timeline' && event.targetId)
                    ))
                ));

                const hasDetailActivityNotice = computed(() => detailActivityNoticeEvents.value.length > 0);

                const detailActivityNoticeText = computed(() => {
                    if (detailActivityNoticeEvents.value.some(event => event.type === 'pot_updated')) {
                        return '有新的花盆信息更新';
                    }
                    return detailActivityNoticeEvents.value.length > 1
                        ? `${detailActivityNoticeEvents.value.length} 条新动态已更新`
                        : (detailActivityNoticeEvents.value[0]?.summary || '有新的动态更新');
                });

                const toggleTimelineSort = () => isTimelineDesc.value = !isTimelineDesc.value;

                const {
                    preloadNearbyGalleryImages,
                    openGallery: openRawGallery,
                    closeGallery,
                    prevImg,
                    nextImg
                } = MyFlowerPotsGallery.createGallery({
                    previewImages,
                    previewIndex,
                    loadToken: galleryImageLoadToken,
                    dragOffset: galleryDragOffset,
                    isDragging: galleryIsDragging
                });

                watch(previewIndex, preloadNearbyGalleryImages);

                const currentPreviewItem = computed(() => previewImages.value?.[previewIndex.value] || null);

                const timelineGalleryItems = computed(() =>
                    MyFlowerPotsGallery.buildTimelineGalleryItems(visibleTimelineRecords.value)
                );

                const galleryIndicatorIndexes = computed(() =>
                    MyFlowerPotsGallery.buildGalleryIndicatorIndexes(previewImages.value.length, previewIndex.value)
                );

                const openGallery = (img, allImages = null, previewSrc = '') => {
                    if (allImages) return openRawGallery(img, allImages, previewSrc);
                    const items = timelineGalleryItems.value;
                    const target = items.find(item => item.fullSrc === img);
                    openRawGallery(target || img, items.length ? items : [img], previewSrc);
                };

                const handleGalleryTouchStart = (e) => {
                    touchStartX.value = e.changedTouches[0].screenX;
                    galleryIsDragging.value = true;
                    galleryDragOffset.value = 0;
                };

                const handleGalleryTouchMove = (e) => {
                    const currentX = e.changedTouches[0].screenX;
                    const diff = currentX - touchStartX.value;
                    const isAtStart = previewIndex.value === 0 && diff > 0;
                    const isAtEnd = previewIndex.value === previewImages.value.length - 1 && diff < 0;
                    galleryDragOffset.value = (isAtStart || isAtEnd) ? diff * 0.25 : diff;
                };

                const handleGalleryTouchEnd = (e) => {
                    const touchEndX = e.changedTouches[0].screenX;
                    const threshold = 60;
                    const diff = touchStartX.value - touchEndX;
                    galleryIsDragging.value = false;
                    galleryDragOffset.value = 0;

                    if (Math.abs(diff) > threshold) {
                        if (diff > 0) nextImg(); else prevImg();
                    }
                };

                const handleKeydown = (e) => {
                    if (previewImages.value.length === 0) return;
                    if (e.key === 'ArrowLeft') {
                        prevImg();
                    } else if (e.key === 'ArrowRight') {
                        nextImg();
                    } else if (e.key === 'Escape') {
                        closeGallery();
                    }
                };

                const closeActionMenuOnOutsidePointer = (event) => {
                    if (!showActionMenu.value) return;
                    const target = event?.target;
                    const isInsideButton = actionMenuButton.value?.contains?.(target);
                    const isInsidePanel = actionMenuPanel.value?.contains?.(target);
                    if (isInsideButton || isInsidePanel) return;
                    showActionMenu.value = false;
                };

                onMounted(() => {
                    init();
                    window.addEventListener('keydown', handleKeydown);
                    document.addEventListener('pointerdown', closeActionMenuOnOutsidePointer, true);
                    barrageRotationTimer = window.setInterval(() => {
                        barrageRotationSlot.value += 1;
                    }, MyFlowerPotsCommentBarrage.REPLY_ROTATION_INTERVAL_MS);
                });

                onUnmounted(() => {
                    window.removeEventListener('keydown', handleKeydown);
                    document.removeEventListener('pointerdown', closeActionMenuOnOutsidePointer, true);
                    stopSectionNavigation();
                    if (barrageRotationTimer) {
                        window.clearInterval(barrageRotationTimer);
                        barrageRotationTimer = null;
                    }
                    setAuthModalBodyLock(false);
                });

                // 组件卸载时移除事件监听
                // 注意：在普通 HTML 环境中使用 Vue.createApp().mount() 时，
                // 如果没有显式处理卸载，可能需要小心内存泄漏，但在这里通常刷新页面即重置。

                const triggerFileInput = () => fileInput.value?.click();

                const getTodayString = () => MyFlowerPotsDate.getLocalDateString();

                const timelineImageCount = () => newTimeline.existingImages.length + newTimeline.tempImages.length;

                const resetTimelineForm = () => {
                    editingTimelineId.value = null;
                    newTimeline.date = getTodayString();
                    newTimeline.description = '';
                    newTimeline.existingImages = [];
                    newTimeline.tempImages = [];
                };

                const openAddTimelineModal = () => {
                    if (isReadOnly.value) return;
                    resetTimelineForm();
                    showAddTimelineModal.value = true;
                };

                const closeTimelineModal = () => {
                    if (isSavingTimeline.value) return;
                    showAddTimelineModal.value = false;
                    resetTimelineForm();
                };

                const openEditTimelineModal = (record) => {
                    if (isReadOnly.value) return;
                    editingTimelineId.value = record.id;
                    newTimeline.date = record.date || getTodayString();
                    newTimeline.description = record.description || '';
                    newTimeline.existingImages = getImages(record.images);
                    newTimeline.tempImages = [];
                    showAddTimelineModal.value = true;
                };

                const onFilesSelected = async (e) => {
                    const remaining = 9 - timelineImageCount();
                    const items = await MyFlowerPotsMedia.selectImages(e, { limit: remaining });
                    newTimeline.tempImages.push(...items);
                };

                const removeExistingTimelineImage = (idx) => newTimeline.existingImages.splice(idx, 1);
                const removeNewImage = (idx) => newTimeline.tempImages.splice(idx, 1);

                const archiveImageCount = () => MyFlowerPotsArchive.archiveImageCount(archiveForm);

                const resetArchiveForm = () => {
                    MyFlowerPotsArchive.resetArchiveForm(archiveForm, archiveFileInput);
                };

                const triggerArchiveFileInput = () => {
                    archiveFileInput.value?.click();
                };

                const onArchiveFilesSelected = async (e) => {
                    await MyFlowerPotsArchive.selectArchiveImages(e, archiveForm);
                };

                const removeArchiveImage = (idx) => {
                    archiveForm.tempImages.splice(idx, 1);
                };

                const uploadArchiveImagesForPot = async (targetPotId) => {
                    return MyFlowerPotsArchive.uploadArchiveImagesForPot(apiClient, archiveForm, targetPotId);
                };

                const saveTimelineRecord = async () => {
                    if (isReadOnly.value) return;
                    if (!newTimeline.date) {
                        showAlert('请选择记录日期');
                        return;
                    }
                    if (timelineImageCount() === 0 && !newTimeline.description?.trim()) {
                        showAlert('请至少上传一张照片或写点描述');
                        return;
                    }
                    try {
                        isSavingTimeline.value = true;
                        const saveRes = await MyFlowerPotsTimeline.saveTimelineForm(apiClient, {
                            potId: potId.value,
                            timelineId: isEditingTimeline.value ? editingTimelineId.value : null,
                            date: newTimeline.date,
                            description: newTimeline.description,
                            existingImages: newTimeline.existingImages,
                            tempImages: newTimeline.tempImages
                        });
                        if (saveRes.success) {
                            showAddTimelineModal.value = false;
                            resetTimelineForm();
                            await loadTimelineRecords();
                        }
                    } catch (e) { showAlert('保存失败，请检查网络后重试'); }
                    finally { isSavingTimeline.value = false; }
                };

                const confirmDeleteTimeline = async (id) => {
                    if (isReadOnly.value) return;
                    if (showConfirm('确认删除这条生长记录？照片也将一并清理。')) {
                        try {
                            const res = await apiClient.deleteTimeline(id);
                            if (res.success) await loadTimelineRecords();
                        } catch (e) { showAlert('删除操作失败'); }
                    }
                };

                const confirmDeletePot = async () => {
                    const message = isArchived.value
                        ? '确定要永久删除这盆已归档植物吗？所有养护记录和成长轨迹都将被永久删除。'
                        : '确定要删除这盆花吗？所有养护记录和成长轨迹都将被永久删除。';
                    if (showConfirm(message)) {
                        try {
                            const res = await apiClient.deletePot(potId.value);
                            if (res.success) window.location.href = '/';
                        } catch (err) { showAlert('删除失败: ' + err.message); }
                    }
                };

                const restoreArchivedPot = async () => {
                    if (!isOwner.value || !isArchived.value) return;
                    if (!showConfirm(`确定将 ${pot.value?.name || '这盆植物'} 恢复到养护中吗？`)) return;
                    try {
                        const res = await apiClient.restorePot(potId.value);
                        if (res.success) {
                            showActionMenu.value = false;
                            await loadPotDetail();
                            await Promise.allSettled([
                                loadCareSchedules(),
                                loadCareRecords(),
                                loadTimelineRecords(),
                                loadPotStats()
                            ]);
                            showAlert('已恢复到养护中。');
                        }
                    } catch (err) {
                        showAlert('恢复失败: ' + (err?.message || '请稍后重试'));
                    }
                };

                const openArchiveModal = () => {
                    if (!isOwner.value || isArchived.value) return;
                    resetArchiveForm();
                    showArchiveModal.value = true;
                };

                const closeArchiveModal = () => {
                    if (isArchiveLoading.value) return;
                    showArchiveModal.value = false;
                    resetArchiveForm();
                };

                const archiveCurrentPot = async () => {
                    if (!isOwner.value || isArchived.value || isArchiveLoading.value) return;
                    try {
                        isArchiveLoading.value = true;
                        const imageUrls = await uploadArchiveImagesForPot(potId.value);
                        const res = await apiClient.archivePot(potId.value, {
                            reason: archiveForm.reason,
                            note: archiveForm.note.trim() || null,
                            imageUrls
                        });
                        if (res.success) {
                            showArchiveModal.value = false;
                            resetArchiveForm();
                            await loadPotDetail();
                            await Promise.allSettled([
                                loadCareSchedules(),
                                loadCareRecords(),
                                loadTimelineRecords(),
                                loadPotStats()
                            ]);
                            showAlert('已归档。');
                        }
                    } catch (err) {
                        showAlert('归档失败: ' + (err?.message || '请稍后重试'));
                    } finally {
                        isArchiveLoading.value = false;
                    }
                };

                // 编辑记录
                const editRecord = (record) => {
                    if (isReadOnly.value) return;
                    window.location.href = `care-record?id=${record.id}`;
                };

                // 删除记录
                const deleteRecord = async (record) => {
                    if (isReadOnly.value) return;
                    // 自定义二次确认逻辑：点击第一次变色/变字，点击第二次执行删除
                    if (confirmingDeleteId.value !== record.id) {
                        confirmingDeleteId.value = record.id;
                        // 3秒后自动重置确认状态
                        setTimeout(() => {
                            if (confirmingDeleteId.value === record.id) confirmingDeleteId.value = null;
                        }, 3000);
                        return;
                    }

                    try {
                        confirmingDeleteId.value = null; // 立即清除状态
                        const res = await apiClient.deleteCareRecord(record.id);
                        if (res.success) {
                            await loadCareRecords();
                            if (currentSheetGroup.value?.records) {
                                // 同步更新当前弹窗内的数据列表
                                currentSheetGroup.value.records = currentSheetGroup.value.records.filter(r => r.id !== record.id);
                                if (currentSheetGroup.value.records.length === 0) closeCareDetails();
                            }
                        } else {
                            showAlert(res.error || '删除失败');
                        }
                    } catch (e) {
                        console.error('Delete record error:', e);
                        showAlert(e.message || '操作失败');
                    }
                };

                // --- 养护提醒逻辑 ---
                const getScheduleTypeStyle = (type, customAction = '') => {
                    const styles = {
                        water: { bg: 'bg-blue-50 text-blue-500', iconClass: 'fa-tint', iconWrap: 'care-schedule-icon-wrap--blue' },
                        fertilize: { bg: 'bg-green-50 text-green-500', iconClass: 'fa-seedling', iconWrap: 'care-schedule-icon-wrap--green' },
                        prune: { bg: 'bg-orange-50 text-orange-500', iconClass: 'fa-cut', iconWrap: 'care-schedule-icon-wrap--coral' },
                        repot: { bg: 'bg-purple-50 text-purple-500', iconClass: 'fa-exchange-alt', iconWrap: 'care-schedule-icon-wrap--purple' },
                        pest: { bg: 'bg-red-50 text-red-500', iconClass: 'fa-bug', iconWrap: 'care-schedule-icon-wrap--red' },
                        custom: { bg: 'bg-gray-50 text-gray-500', iconClass: 'fa-sliders-h', iconWrap: 'care-schedule-icon-wrap--gray' }
                    };
                    return styles[normalizeCareType(type, customAction)] || styles.custom;
                };

                const getScheduleTypeName = (type, customAction = '') => {
                    const names = { water: '浇水', fertilize: '施肥', prune: '修剪', repot: '换盆', pest: '病虫害' };
                    return String(customAction || '').trim() || names[normalizeCareType(type, customAction)] || '自定义提醒';
                };

                const saveNewSchedule = async () => {
                    if (isReadOnly.value) return;
                    const customAction = String(newSchedule.customAction || '').trim();
                    if (newSchedule.careType === 'custom' && !customAction) {
                        showAlert('请输入自定义名称');
                        return;
                    }
                    const intervalDays = normalizeScheduleInterval(newSchedule.intervalDays);
                    newSchedule.intervalDays = intervalDays;
                    try {
                        const res = isEditingSchedule.value
                            ? await apiClient.updateCareSchedule(editingScheduleId.value, {
                                intervalDays,
                                ...(newSchedule.careType === 'custom' ? { customAction } : {})
                            })
                            : await apiClient.createCareSchedule({
                                potId: potId.value,
                                careType: newSchedule.careType,
                                customAction,
                                intervalDays
                            });
                        if (res.success) {
                            closeScheduleModal();
                            await loadCareSchedules();
                        }
                    } catch (e) { showAlert(e?.message || (isEditingSchedule.value ? '修改失败' : '添加失败')); }
                };

                const toggleScheduleEnabled = async (schedule) => {
                    if (isReadOnly.value) return;
                    try {
                        const nextState = !schedule.enabled;
                        const res = await apiClient.updateCareSchedule(schedule.id, {
                            enabled: nextState ? 1 : 0
                        });
                        if (res.success) schedule.enabled = nextState;
                    } catch (e) { showAlert('操作失败'); }
                };

                const deleteSchedule = async (schedule) => {
                    if (isReadOnly.value) return;
                    if (!showConfirm('确定要删除这个提醒吗？')) return;
                    try {
                        const res = await apiClient.deleteCareSchedule(schedule.id);
                        if (res.success) await loadCareSchedules();
                    } catch (e) { showAlert('删除失败'); }
                };

                const updateScheduleInterval = async (schedule) => {
                    if (isReadOnly.value) return;
                    schedule.intervalDays = normalizeScheduleInterval(schedule.intervalDays);
                    try {
                        await apiClient.updateCareSchedule(schedule.id, {
                            intervalDays: schedule.intervalDays
                        });
                    } catch (e) { showAlert('更新失败'); }
                };

                const buildPotSubpageUrl = (page) => {
                    const params = new URLSearchParams();
                    if (potId.value) params.set('potId', potId.value);
                    if (shareToken.value) params.set('token', shareToken.value);
                    const query = params.toString();
                    return query ? `${page}?${query}` : page;
                };

                // 查看全部记录/轨迹
                const viewAllRecords = () => window.location.href = buildPotSubpageUrl('all-records');
                const viewAllTimelines = () => window.location.href = buildPotSubpageUrl('all-timelines');

                // 统计
                const statsWaterCount = computed(() => potStats.value?.byType?.find(t => t.type === 'water')?.total_count || 0);
                const statsFertilizeCount = computed(() => potStats.value?.byType?.find(t => t.type === 'fertilize')?.total_count || 0);
                const statsCareCount = computed(() => Number(potStats.value?.total?.total_records || 0));

                const formatDate = MyFlowerPotsDate.formatIsoDate;
                const growthDurationDays = computed(() => MyFlowerPotsDate.getGrowthDurationDays(pot.value));
                const growthDurationText = computed(() =>
                    MyFlowerPotsDate.formatGrowthDuration(pot.value, '无', { includeExactDays: true })
                );

                const formatCommentTime = (dateStr) => MyFlowerPotsDate.formatUtcDateTime(dateStr);

                const handleHeroImageLoad = () => {
                    heroImageLoaded.value = true;
                };

                const handleHeroImageError = (e) => {
                    const fallbackSrc = fallbackPotImage;
                    if (e?.target?.src && !e.target.src.includes(fallbackSrc)) {
                        heroImageLoaded.value = false;
                        e.target.src = fallbackSrc;
                        return;
                    }
                    heroImageLoaded.value = true;
                };

                const handleImageError = (e) => MyFlowerPotsMedia.setImageFallback(e, fallbackPotImage);

                const goBack = () => window.location.href = '/';
                const goEditPage = () => {
                    if (isReadOnly.value) return;
                    window.location.href = `edit-pot?id=${potId.value}`;
                };
                const goAddCarePage = () => {
                    if (isReadOnly.value) return;
                    window.location.href = `care-record?potId=${potId.value}`;
                };
                const showCarePanelAddButton = computed(() =>
                    !isReadOnly.value &&
                    (
                        carePanelActiveTab.value === 'records' ||
                        (carePanelActiveTab.value === 'schedules' && canShowCareSchedules.value)
                    )
                );
                const carePanelAddLabel = computed(() =>
                    carePanelActiveTab.value === 'schedules' ? '添加提醒' : '新增养护'
                );
                const handleCarePanelAdd = () => {
                    if (!showCarePanelAddButton.value) return;
                    if (carePanelActiveTab.value === 'schedules') {
                        openAddScheduleModal();
                        return;
                    }
                    goAddCarePage();
                };
                const goCreatePot = () => window.location.href = '/';

                const getDetailSectionPositions = () => sectionTabs.value
                    .map((section) => {
                        const element = document.getElementById(section.id);
                        return element
                            ? { key: section.key, top: element.getBoundingClientRect().top }
                            : null;
                    })
                    .filter(Boolean);

                const syncActiveSection = () => {
                    const nextSection = sectionNavUtils?.getActiveSectionKey({
                        sections: getDetailSectionPositions(),
                        activationY: sectionNavigationActivationY,
                        viewportBottom: window.scrollY + window.innerHeight,
                        documentHeight: Math.max(
                            document.documentElement?.scrollHeight || 0,
                            document.body?.scrollHeight || 0
                        ),
                    });
                    if (nextSection) activeSection.value = nextSection;
                };

                const scheduleSectionNavigationSync = () => {
                    if (sectionNavigationFrame !== null) return;
                    sectionNavigationFrame = window.requestAnimationFrame(() => {
                        sectionNavigationFrame = null;
                        syncActiveSection();
                    });
                };

                const stopSectionNavigation = () => {
                    if (sectionNavigationObserver) {
                        sectionNavigationObserver.disconnect();
                        sectionNavigationObserver = null;
                    }
                    window.removeEventListener('scroll', scheduleSectionNavigationSync);
                    window.removeEventListener('resize', scheduleSectionNavigationSync);
                    if (sectionNavigationFrame !== null) {
                        window.cancelAnimationFrame(sectionNavigationFrame);
                        sectionNavigationFrame = null;
                    }
                };

                const startSectionNavigation = () => {
                    stopSectionNavigation();
                    const elements = sectionTabs.value
                        .map((section) => document.getElementById(section.id))
                        .filter(Boolean);
                    if (elements.length === 0) return;

                    if (typeof IntersectionObserver === 'function') {
                        sectionNavigationObserver = new IntersectionObserver(
                            scheduleSectionNavigationSync,
                            { rootMargin: `-${sectionNavigationActivationY}px 0px 0px 0px`, threshold: [0, 0.01] }
                        );
                        elements.forEach((element) => sectionNavigationObserver.observe(element));
                    }

                    window.addEventListener('scroll', scheduleSectionNavigationSync, { passive: true });
                    window.addEventListener('resize', scheduleSectionNavigationSync);
                    scheduleSectionNavigationSync();
                };

                const scrollToSection = (sectionId, sectionKey) => {
                    const el = document.getElementById(sectionId);
                    if (!el) return;
                    activeSection.value = sectionKey;
                    const y = el.getBoundingClientRect().top + window.scrollY - 120;
                    window.scrollTo({ top: y, behavior: 'smooth' });
                };

                watch([isLoading, pot], async ([loading, currentPot]) => {
                    if (loading || !currentPot) {
                        stopSectionNavigation();
                        return;
                    }
                    await nextTick();
                    if (!isLoading.value && pot.value) startSectionNavigation();
                }, { flush: 'post' });

                // --- 业务模块逻辑 ---

                // QR Code 实例 (非响应式)
                let qrCode = null;
                let qrCodeLibraryPromise = null;

                const loadQRCodeLibrary = () => {
                    if (window.QRCodeStyling) return Promise.resolve(window.QRCodeStyling);
                    if (!qrCodeLibraryPromise) {
                        qrCodeLibraryPromise = new Promise((resolve, reject) => {
                            const script = document.createElement('script');
                            script.src = 'https://unpkg.com/qr-code-styling@1.5.0/lib/qr-code-styling.js';
                            script.async = true;
                            script.onload = () => resolve(window.QRCodeStyling);
                            script.onerror = () => reject(new Error('二维码组件加载失败'));
                            document.head.appendChild(script);
                        });
                    }
                    return qrCodeLibraryPromise;
                };

                const getPublicShareUrl = () => {
                    if (!pot.value?.share_token) return '';
                    const config = window.APP_CONFIG || {};
                    const frontendConfig = config.frontend || { prodUrl: 'https://app.kaside365.com', devUrl: window.location.origin };

                    const baseUrl = config.isDevelopment ? frontendConfig.devUrl : frontendConfig.prodUrl;

                    // 确保 baseUrl 不以 / 结尾，且 pathname 是固定的 /pot-detail
                    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
                    return `${cleanBaseUrl}/pot-detail?token=${pot.value.share_token}`;
                };

                const buildInviteShareTitle = (type, name = pot.value?.name, withBrand = false) => {
                    const label = type === 'collab' ? '邀请共同照料' : '邀请查看';
                    const subject = String(name || '这盆植物').trim();
                    const title = `${label}：${subject}`;
                    return withBrand ? `${title} - 我的花盆` : title;
                };

                const buildInviteShareText = (type) => {
                    const title = buildInviteShareTitle(type, pot.value?.name, true);
                    const name = String(pot.value?.name || '').trim();
                    const actionText = type === 'collab'
                        ? (name ? `登录后可以一起养护 ${name}。` : '登录后可以一起加入共同照料。')
                        : (name ? `登录后可以查看 ${name} 的成长记录。` : '登录后可以查看这盆植物。');
                    return `${title}\n${actionText}`;
                };

                const shouldPreserveInjectedInviteTitle = (title) => /^邀请(共同照料|查看)：.+ - 我的花盆$/.test(String(title || '').trim());

                const syncInviteMetadata = (type, name = '') => {
                    const currentTitle = String(document.title || '').trim();
                    if (!name && shouldPreserveInjectedInviteTitle(currentTitle)) return;
                    const title = buildInviteShareTitle(type, name, true);
                    document.title = title;
                    document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
                    document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', title);
                };

                const prepareInviteLoginPrompt = (type, inviteData = null) => {
                    const name = String(inviteData?.pot?.name || '').trim();
                    syncInviteMetadata(type, name);
                    const isCollab = type === 'collab';
                    pendingInvitePrompt.value = {
                        icon: isCollab ? 'fa-users' : 'fa-book-open',
                        title: name
                            ? `${isCollab ? '登录后接受共同照料邀请' : '登录后接受查看邀请'}：${name}`
                            : (isCollab ? '登录后接受共同照料邀请' : '登录后接受查看邀请'),
                        lead: isCollab
                            ? '登录或注册后即可加入这盆植物的共同照料。'
                            : '登录或注册后即可查看这盆植物的成长记录。'
                    };
                    openInviteLogin();
                };

                const shareViaSystem = async ({ title, text, url, documentTitle }) => {
                    if (!canUseNativeShare.value || !url) return { status: 'unsupported' };
                    const previousTitle = document.title;
                    try {
                        if (typeof navigator.canShare === 'function' && !navigator.canShare({ url })) {
                            return { status: 'unsupported' };
                        }
                        if (documentTitle) {
                            document.title = documentTitle;
                        }
                        await navigator.share({ title, text, url });
                        return { status: 'shared' };
                    } catch (error) {
                        if (error?.name === 'AbortError') {
                            return { status: 'cancelled' };
                        }
                        console.warn('Native share failed, falling back:', error);
                        return { status: 'failed', error };
                    } finally {
                        if (documentTitle && previousTitle) {
                            document.title = previousTitle;
                        }
                    }
                };

                const generateQRCode = async () => {
                    if (!pot.value) return;

                    const shareUrl = getPublicShareUrl();
                    if (!shareUrl) return;
                    const QRCodeCtor = await loadQRCodeLibrary();

                    // 初始化或更新 QR Code
                    const options = {
                        width: 250,
                        height: 250,
                        type: 'canvas',
                        data: shareUrl,
                        image: 'assets/images/icons/icons-default-pot.png',
                        dotsOptions: { color: '#059669', type: 'rounded' },
                        backgroundOptions: { color: '#ffffff' },
                        imageOptions: { crossOrigin: 'anonymous', margin: 8 }
                    };

                    if (!qrCode) {
                        qrCode = new QRCodeCtor(options);
                    } else {
                        qrCode.update(options);
                    }

                    setTimeout(() => {
                        const container = document.getElementById('qrcode-container');
                        if (container) {
                            container.innerHTML = '';
                            qrCode.append(container);
                        }
                    }, 50);
                };

                const openPublicShareModal = () => {
                    showPublicQrCode.value = false;
                    showShareModal.value = false;
                    showPublicShareModal.value = true;
                };

                const closePublicShareModal = () => {
                    showPublicShareModal.value = false;
                    showPublicQrCode.value = false;
                };

                const returnToShareModal = () => {
                    closePublicShareModal();
                    showShareModal.value = true;
                };

                const togglePublicQrCode = async () => {
                    if (!pot.value?.is_shared) return;
                    showPublicQrCode.value = !showPublicQrCode.value;
                    if (showPublicQrCode.value) {
                        try {
                            await nextTick();
                            await generateQRCode();
                        } catch (error) {
                            console.warn('QR code load error:', error);
                            showPublicQrCode.value = false;
                            showAlert('二维码加载失败，请稍后重试');
                        }
                    }
                };

                const enablePublicShare = async () => {
                    if (isPublicShareLoading.value) return;
                    try {
                        isPublicShareLoading.value = true;
                        const res = await apiClient.enableShare(potId.value);
                        if (res.success) {
                            pot.value.is_shared = true;
                            pot.value.share_token = res.data.token;
                            showPublicQrCode.value = false;
                        }
                    } catch (e) {
                        showAlert('操作失败: ' + e.message);
                    } finally {
                        isPublicShareLoading.value = false;
                        syncUrlWithShareStatus();
                    }
                };

                const disablePublicShare = async () => {
                    if (isPublicShareLoading.value) return;
                    if (!showConfirm('关闭后，当前公开链接和二维码将失效。确定关闭吗？')) return;
                    try {
                        isPublicShareLoading.value = true;
                        const res = await apiClient.disableShare(potId.value);
                        if (res.success) {
                            pot.value.is_shared = false;
                            pot.value.share_token = null;
                            showPublicQrCode.value = false;
                            qrCode = null;
                            const container = document.getElementById('qrcode-container');
                            if (container) container.innerHTML = '';
                        }
                    } catch (e) {
                        showAlert('操作失败: ' + e.message);
                    } finally {
                        isPublicShareLoading.value = false;
                        syncUrlWithShareStatus();
                    }
                };

                const downloadQRCode = async () => {
                    if (!pot.value) return;
                    if (!qrCode) {
                        await generateQRCode();
                    }
                    if (!qrCode) return;
                    try {
                        const blob = await qrCode.getRawData("png");
                        if (!blob) throw new Error("No blob generated");
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement("canvas");
                            const paddingBottom = 60; // 底部留白给文字
                            canvas.width = img.width;
                            canvas.height = img.height + paddingBottom;
                            const ctx = canvas.getContext("2d");

                            // 填充白底
                            ctx.fillStyle = "#ffffff";
                            ctx.fillRect(0, 0, canvas.width, canvas.height);

                            // 绘制原二维码
                            ctx.drawImage(img, 0, 0);

                            // 绘制文字
                            ctx.fillStyle = "#1f2937"; // text-gray-800
                            ctx.font = "bold 20px sans-serif";
                            ctx.textAlign = "center";
                            ctx.textBaseline = "middle";
                            ctx.fillText(pot.value.name, canvas.width / 2, img.height + (paddingBottom / 2));

                            // 触发下载
                            const a = document.createElement("a");
                            a.download = `${pot.value.name}-分享码.png`;
                            a.href = canvas.toDataURL("image/png");
                            document.body.appendChild(a); // required for some browsers
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(img.src);
                        };
                        img.onerror = () => {
                            // Fallback
                            qrCode.download({ name: `${pot.value.name}-分享码`, extension: 'png' });
                        };
                        img.src = URL.createObjectURL(blob);
                    } catch (e) {
                        console.error("生成复合二维码失败", e);
                        qrCode.download({ name: `${pot.value.name}-分享码`, extension: 'png' });
                    }
                };

                const copyShareLink = async () => {
                    const shareUrl = getPublicShareUrl();
                    if (!shareUrl) {
                        showAlert('分享链接生成失败，请稍后重试');
                        return;
                    }
                    const isWeChat = /MicroMessenger/i.test(navigator.userAgent || '');
                    const copied = await copyTextSafely(shareUrl);
                    if (copied) {
                        showAlert(
                            isWeChat
                                ? '链接已复制！请点击微信右上角“...”选择“发送给朋友”进行分享。'
                                : '分享链接已复制到剪贴板，快发送给好友吧！'
                        );
                    } else {
                        showCopyFallback(
                            shareUrl,
                            isWeChat
                                ? '当前环境没能自动复制。系统已切到增强复制模式；你也可以点“再次复制”，然后通过微信右上角“...”分享：'
                                : '分享链接已生成。系统已切到增强复制模式；如果还没成功，可点“再次复制”：'
                        );
                    }
                };

                const sharePublicLink = async () => {
                    const shareUrl = getPublicShareUrl();
                    if (!shareUrl) {
                        showAlert('分享链接生成失败，请稍后重试');
                        return;
                    }

                    const result = await shareViaSystem({
                        title: pot.value?.name
                            ? `${isArchived.value ? '分享归档记录' : '分享植物'}：${pot.value.name}`
                            : (isArchived.value ? '分享归档花盆' : '分享花盆'),
                        text: pot.value?.name
                            ? `邀请你一起看看 ${pot.value.name} 的${isArchived.value ? '归档记录' : '成长记录'}。`
                            : `邀请你一起看看这盆植物的${isArchived.value ? '归档记录' : '成长记录'}。`,
                        url: shareUrl
                    });

                    if (result.status === 'shared' || result.status === 'cancelled') {
                        return;
                    }

                    await copyShareLink();
                };

                const copyCollaboratorInvite = async () => {
                    if (isArchived.value) return;
                    try {
                        const res = await apiClient.createCollaboratorInvite(potId.value);
                        const inviteUrl = res.data?.inviteUrl;
                        if (!res.success || !inviteUrl) {
                            showAlert('没有生成可用的共同养护邀请链接。');
                            return;
                        }

                        const inviteTitle = buildInviteShareTitle('collab', pot.value?.name, true);
                        const shareResult = await shareViaSystem({
                            title: inviteTitle,
                            text: buildInviteShareText('collab'),
                            documentTitle: inviteTitle,
                            url: inviteUrl
                        });
                        if (shareResult.status === 'shared' || shareResult.status === 'cancelled') {
                            return;
                        }

                        const copied = await copyTextSafely(inviteUrl);
                        if (copied) {
                            showAlert('共同养护邀请链接已复制，可直接发给好友。该链接仅用于邀请协作者，不等同于公开分享。');
                        } else {
                            showCopyFallback(inviteUrl, '共同养护邀请链接已生成。系统已切到增强复制模式；如果还没成功，可点“再次复制”：');
                        }
                    } catch (e) {
                        showAlert('生成邀请链接失败: ' + e.message);
                    }
                };

                const copyViewerInvite = async () => {
                    try {
                        const res = await apiClient.createViewerInvite(potId.value);
                        const inviteUrl = res.data?.inviteUrl;
                        if (!res.success || !inviteUrl) {
                            showAlert('没有生成可用的查看邀请链接。');
                            return;
                        }

                        const inviteTitle = buildInviteShareTitle('viewer', pot.value?.name, true);
                        const shareResult = await shareViaSystem({
                            title: inviteTitle,
                            text: buildInviteShareText('viewer'),
                            documentTitle: inviteTitle,
                            url: inviteUrl
                        });
                        if (shareResult.status === 'shared' || shareResult.status === 'cancelled') {
                            return;
                        }

                        const copied = await copyTextSafely(inviteUrl);
                        if (copied) {
                            showAlert(isArchived.value
                                ? '归档查看链接已复制，可直接发给好友。对方接受后只能查看历史记录，无法编辑。'
                                : '查看邀请链接已复制，可直接发给好友。对方接受后会出现在“好友分享”中，但无法编辑。');
                        } else {
                            showCopyFallback(inviteUrl, '查看邀请链接已生成。系统已切到增强复制模式；如果还没成功，可点“再次复制”：');
                        }
                    } catch (e) {
                        showAlert('生成邀请链接失败: ' + e.message);
                    }
                };

                const loadPotComments = async () => {
                    if (!potId.value || !canCommentAsMember.value) {
                        potComments.value = [];
                        return;
                    }
                    isCommentsLoading.value = true;
                    try {
                        const res = await apiClient.getPotComments(potId.value);
                        if (res.success) {
                            potComments.value = res.data || [];
                        }
                    } catch (e) {
                        console.warn('Load pot comments failed', e);
                    } finally {
                        isCommentsLoading.value = false;
                    }
                };

                const scrollCommentInputIntoView = (delay = 120) => {
                    if (!isCompactCommentViewport.value) return;
                    window.setTimeout(() => {
                        const target = commentInputRef.value?.closest?.('.comment-composer-panel') || commentInputRef.value;
                        target?.scrollIntoView({ block: 'end', behavior: 'smooth' });
                    }, delay);
                };

                const focusCommentInput = ({ force = false } = {}) => {
                    if (isCompactCommentViewport.value && !force) return;

                    const focusInput = () => {
                        const input = commentInputRef.value;
                        if (!input) return;
                        try {
                            input.focus({ preventScroll: isCompactCommentViewport.value });
                        } catch (_) {
                            input.focus();
                        }
                        scrollCommentInputIntoView(160);
                    };

                    if (force && commentInputRef.value) {
                        focusInput();
                    }
                    nextTick(focusInput);
                };

                const handleCommentInputFocus = () => {
                    scrollCommentInputIntoView(180);
                };

                const openCommentModal = () => {
                    replyTargetComment.value = null;
                    showCommentModal.value = true;
                    focusCommentInput();
                };

                const closeCommentModal = () => {
                    showCommentModal.value = false;
                    replyTargetComment.value = null;
                };

                const beginReply = (comment) => {
                    replyTargetComment.value = comment;
                    showCommentModal.value = true;
                    focusCommentInput({ force: true });
                };

                const cancelReply = () => {
                    replyTargetComment.value = null;
                };

                const toggleCommentSort = () => {
                    commentSortOrder.value = commentSortOrder.value === 'asc' ? 'desc' : 'asc';
                };

                const canDeleteComment = (comment) => {
                    if (!currentUser.value || !comment || comment.isLegacy) return false;
                    return isOwner.value || comment.senderId === currentUser.value.id;
                };

                const deleteComment = async (comment) => {
                    if (!comment?.id || comment.isLegacy) return;
                    const isReply = !!comment.senderId && !!comment.createdAt && !potComments.value.some(item => item.id === comment.id);
                    const confirmText = isReply
                        ? '确定删除这条回复吗？'
                        : '确定删除这条留言吗？删除主留言时，会一并删除它下面的回复。';
                    if (!showConfirm(confirmText)) return;
                    try {
                        const res = await apiClient.deletePotComment(comment.id);
                        if (res.success) {
                            if (replyTargetComment.value?.id === comment.id) {
                                cancelReply();
                            }
                            await loadPotComments();
                        }
                    } catch (e) {
                        showAlert('删除失败: ' + e.message);
                    }
                };

                const toggleCommentDanmaku = async () => {
                    if (!canManageCommentDanmaku.value || !potId.value || !pot.value) return;
                    const previous = showCommentDanmaku.value;
                    const next = !previous;
                    showCommentDanmaku.value = next;
                    pot.value.show_comment_danmaku = next ? 1 : 0;
                    try {
                        const res = await apiClient.setCommentDanmakuVisibility(potId.value, next);
                        if (res.success) {
                            pot.value.show_comment_danmaku = Number(res.data?.enabled ?? (next ? 1 : 0));
                            showCommentDanmaku.value = pot.value.show_comment_danmaku === 1;
                        }
                    } catch (e) {
                        showCommentDanmaku.value = previous;
                        pot.value.show_comment_danmaku = previous ? 1 : 0;
                        showAlert('更新弹幕开关失败: ' + e.message);
                    }
                };

                const submitComment = async () => {
                    const content = commentForm.content.trim();
                    if (!content) return;
                    if (!potId.value) return;
                    try {
                        isSubmittingComment.value = true;
                        const target = replyTargetComment.value;
                        const res = target && !target.isLegacy
                            ? await apiClient.replyPotComment(target.id, content, shareToken.value)
                            : await apiClient.sendPotComment(potId.value, content, shareToken.value);
                        if (res.success) {
                            commentForm.content = '';
                            closeCommentModal();
                            const count = Number(res.data?.recipientCount || 0);
                            await loadPotComments();
                            const actionText = target ? '回复已发送' : '留言已发送';
                            showAlert(count > 0 ? `${actionText}，已同步给 ${count} 位相关成员。` : `${actionText}，但当前没有其他成员可接收。`);
                        }
                    } catch (e) {
                        showAlert('发送失败: ' + e.message);
                    } finally {
                        isSubmittingComment.value = false;
                    }
                };

                // 成员与权限
                const loadCollaborators = async () => {
                    if (!isOwner.value) return;
                    try {
                        const res = await apiClient.getCollaborators(potId.value);
                        if (res.success) {
                            collaborators.value = (res.data || []).map(member => ({ ...member, role: 'collaborator' }));
                        }
                    } catch (e) { console.error('Load collaborators failed', e); }
                };

                const loadViewers = async () => {
                    if (!isOwner.value) return;
                    try {
                        const res = await apiClient.getViewers(potId.value);
                        if (res.success) {
                            viewers.value = (res.data || []).map(member => ({ ...member, role: 'viewer' }));
                        }
                    } catch (e) { console.error('Load viewers failed', e); }
                };

                const loadMembers = async () => {
                    if (!isOwner.value) return;
                    if (isArchived.value) {
                        collaborators.value = [];
                        await loadViewers();
                        return;
                    }
                    await Promise.all([loadCollaborators(), loadViewers()]);
                };

                const syncMemberCounts = () => {
                    if (!pot.value) return;
                    pot.value.collaborator_count = collaborators.value.length;
                    pot.value.viewer_count = viewers.value.length;
                };

                const memberDisplayName = (member) => member?.display_name || member?.email || '成员';
                const memberInitial = (member) => {
                    const source = memberDisplayName(member);
                    return String(source || '?').trim().charAt(0).toUpperCase() || '?';
                };

                const handleMemberAvatarError = (event) => {
                    const img = event?.target;
                    if (!img) return;
                    img.style.display = 'none';
                    const fallback = img.nextElementSibling;
                    if (fallback) fallback.classList.remove('hidden');
                };

                const getShareAccessStateClass = (state) => {
                    if (state?.disabled) return 'bg-gray-50 text-gray-400 border-gray-100 cursor-not-allowed opacity-75';
                    if (state?.key === 'public') return 'bg-green-50 text-green-700 border-green-100 hover:bg-green-100';
                    if (state?.key === 'viewer') return 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100';
                    return 'bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100';
                };

                const getShareAccessIconClass = (state) => {
                    if (state?.disabled) return 'bg-gray-100 text-gray-400';
                    if (state?.key === 'public') return 'bg-green-100 text-green-600';
                    if (state?.key === 'viewer') return 'bg-emerald-100 text-emerald-600';
                    return 'bg-blue-100 text-blue-600';
                };

                const getShareAccessStatusClass = (state) => {
                    if (state?.disabled) return 'bg-gray-100 text-gray-400';
                    if (state?.key === 'public') {
                        return pot.value?.is_shared ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400';
                    }
                    if (state?.key === 'viewer') return 'bg-emerald-100 text-emerald-600';
                    return 'bg-blue-100 text-blue-600';
                };

                const normalizeMemberRole = (role) => (
                    role === 'collaborator' && !isArchived.value ? 'collaborator' : 'viewer'
                );

                const setActiveMemberRole = (role) => {
                    const nextRole = normalizeMemberRole(role);
                    if (activeMemberRole.value !== nextRole) {
                        activeMemberMenuId.value = null;
                    }
                    activeMemberRole.value = nextRole;
                };

                const getMemberMenuKey = (member, role = member?.role) => `${role}:${member?.id || ''}`;

                const toggleMemberMenu = (member, role) => {
                    const key = getMemberMenuKey(member, role);
                    activeMemberMenuId.value = activeMemberMenuId.value === key ? null : key;
                };

                const openMembersModal = async (role = 'viewer') => {
                    if (!isOwner.value) return;
                    setActiveMemberRole(role);
                    showShareModal.value = false;
                    showMembersModal.value = true;
                    activeMemberMenuId.value = null;
                    await loadMembers();
                };

                const closeMembersModal = () => {
                    showMembersModal.value = false;
                    activeMemberMenuId.value = null;
                };

                const returnToShareFromMembers = () => {
                    closeMembersModal();
                    showShareModal.value = true;
                };

                const handleShareAccessStateClick = async (state) => {
                    if (!state || state.disabled) return;
                    if (state.key === 'public') {
                        openPublicShareModal();
                        return;
                    }
                    await openMembersModal(state.key);
                };

                const setMemberInviteRole = (role) => {
                    if (role === 'collaborator' && isArchived.value) return;
                    memberInviteRole.value = role === 'collaborator' ? 'collaborator' : 'viewer';
                };

                const openMemberInvite = (role = 'viewer') => {
                    setMemberInviteRole(role);
                    if (isArchived.value) memberInviteRole.value = 'viewer';
                    setActiveMemberRole(memberInviteRole.value);
                    memberInviteEmail.value = '';
                    isMemberInviteLoading.value = false;
                    activeMemberMenuId.value = null;
                    showMembersModal.value = false;
                    showMemberInviteModal.value = true;
                };

                const closeMemberInviteModal = () => {
                    showMemberInviteModal.value = false;
                    memberInviteEmail.value = '';
                    isMemberInviteLoading.value = false;
                };

                const returnToMembersFromInvite = () => {
                    closeMemberInviteModal();
                    setActiveMemberRole(memberInviteRole.value);
                    showMembersModal.value = true;
                    loadMembers();
                };

                const submitMemberEmailInvite = async () => {
                    if (!memberInviteEmail.value.trim()) return;
                    if (!isMemberInviteEmailValid.value) {
                        showAlert('请输入正确的邮箱地址');
                        return;
                    }
                    if (memberInviteRole.value === 'collaborator' && isArchived.value) return;
                    try {
                        isMemberInviteLoading.value = true;
                        const normalizedEmail = formUtils.normalizeEmail(memberInviteEmail.value);
                        const isCollabInvite = memberInviteRole.value === 'collaborator';
                        const res = isCollabInvite
                            ? await apiClient.addCollaborator(potId.value, normalizedEmail)
                            : await apiClient.addViewer(potId.value, normalizedEmail);
                        if (res.success) {
                            memberInviteEmail.value = '';
                            setActiveMemberRole(memberInviteRole.value);
                            await loadMembers();
                            showMemberInviteModal.value = false;
                            showMembersModal.value = true;
                            showAlert(isCollabInvite ? '已直接添加为共同照料成员。' : '已直接添加为仅查看成员。');
                        }
                    } catch (e) {
                        showAlert('添加失败: ' + e.message);
                    } finally {
                        isMemberInviteLoading.value = false;
                    }
                };

                const shareMemberInviteLink = async () => {
                    if (memberInviteRole.value === 'collaborator') {
                        await copyCollaboratorInvite();
                        return;
                    }
                    await copyViewerInvite();
                };

                const moveMemberLocally = (member, nextRole) => {
                    const normalizedMember = { ...member, role: nextRole };
                    collaborators.value = collaborators.value.filter(item => item.id !== member.id);
                    viewers.value = viewers.value.filter(item => item.id !== member.id);
                    if (nextRole === 'collaborator') {
                        collaborators.value.push(normalizedMember);
                    } else {
                        viewers.value.push(normalizedMember);
                    }
                    syncMemberCounts();
                };

                const changeMemberRole = async (member, nextRole) => {
                    if (!member?.id) return;
                    if (nextRole === 'collaborator' && isArchived.value) return;
                    if (member.role === nextRole) return;
                    const name = memberDisplayName(member);
                    const confirmText = nextRole === 'viewer'
                        ? `将 ${name} 改为仅查看？\n对方将不能再新增或编辑养护、时间线、提醒。`
                        : `将 ${name} 改为共同照料？\n对方将可以新增和编辑养护、时间线、提醒。`;
                    if (!showConfirm(confirmText)) return;
                    activeMemberMenuId.value = null;
                    try {
                        memberRoleUpdatingUserId.value = member.id;
                        const res = await apiClient.updatePotMemberRole(potId.value, member.id, nextRole);
                        if (res.success) {
                            moveMemberLocally(member, nextRole);
                            showAlert('权限已更新');
                        }
                    } catch (e) {
                        showAlert('权限更新失败: ' + e.message);
                    } finally {
                        memberRoleUpdatingUserId.value = null;
                    }
                };

                const removeMember = async (member, role = member?.role) => {
                    if (!member?.id) return;
                    const name = memberDisplayName(member);
                    if (!showConfirm(`确定移除成员 ${name} 吗？`)) return;
                    activeMemberMenuId.value = null;
                    try {
                        memberRoleUpdatingUserId.value = member.id;
                        const res = role === 'collaborator'
                            ? await apiClient.removeCollaborator(potId.value, member.id)
                            : await apiClient.removeViewer(potId.value, member.id);
                        if (res.success) {
                            collaborators.value = collaborators.value.filter(item => item.id !== member.id);
                            viewers.value = viewers.value.filter(item => item.id !== member.id);
                            syncMemberCounts();
                        }
                    } catch (e) {
                        showAlert('移除失败: ' + e.message);
                    } finally {
                        memberRoleUpdatingUserId.value = null;
                    }
                };

                const addCollaborator = async () => {
                    if (isArchived.value) return;
                    memberInviteRole.value = 'collaborator';
                    memberInviteEmail.value = newCollaboratorEmail.value;
                    await submitMemberEmailInvite();
                    newCollaboratorEmail.value = memberInviteEmail.value;
                };

                const addViewer = async () => {
                    memberInviteRole.value = 'viewer';
                    memberInviteEmail.value = newViewerEmail.value;
                    await submitMemberEmailInvite();
                    newViewerEmail.value = memberInviteEmail.value;
                };

                const removeCollaborator = async (collab) => removeMember({ ...collab, role: 'collaborator' }, 'collaborator');
                const removeViewer = async (viewer) => removeMember({ ...viewer, role: 'viewer' }, 'viewer');

                const selectTransferCollab = (collab) => {
                    selectedTransferUser.value = collab;
                    transferEmail.value = collab.email;
                    showTransferSuggestions.value = false; // 选中后隐藏
                };

                // 移交所有权 (已在 setup 顶部处理了其他方法)
                const initTransfer = async () => {
                    if (isArchived.value) return;
                    if (!transferEmail.value) {
                        showAlert('请输入接收者的电子邮箱');
                        return;
                    }
                    if (!formUtils.isValidEmail(transferEmail.value)) {
                        showAlert('请输入正确的邮箱地址');
                        return;
                    }
                    if (!showConfirm(`确定要将花盆移交给 ${transferEmail.value} 吗？\n系统将向该邮箱发送通知邮件，对方通过邮件或消息中心确认后完成移交。`)) return;

                    try {
                        transferEmail.value = formUtils.normalizeEmail(transferEmail.value);
                        const res = await apiClient.initTransfer(potId.value, transferEmail.value);
                        if (res.success) {
                            showAlert('移交申请已发起！\n系统已向对方发送邮件通知。您可以在页面顶部查看进度或撤销移交。');
                            showTransferModal.value = false;
                            loadPotDetail();
                        }
                    } catch (e) {
                        showAlert('发起移交失败: ' + e.message);
                    }
                };

                const userDisplayName = computed(() => {
                    if (currentUser.value?.userType === 'anonymous') return '匿名用户';
                    if (currentUser.value) {
                        return currentUser.value.displayName || currentUser.value.email?.split('@')[0] || '用户';
                    }
                    return '未登录';
                });

                // 监听成员弹窗开启加载数据
                watch([showMembersModal, showTransferModal], ([membersVisible, transferVisible]) => {
                    if (membersVisible) loadMembers();
                    if (transferVisible) loadCollaborators();
                });

                watch(isArchived, (archived) => {
                    if (archived) setActiveMemberRole('viewer');
                });

                watch(transferEmail, (val) => {
                    if (val) selectedTransferUser.value = null;
                });

                // onMounted(init);
                // 已经移动到上方的 onMounted 中了

                const imgUrl = MyFlowerPotsMedia.imgUrl;
                const heroImageSrc = computed(() => imgUrl(pot.value?.image_url, 800, 512) || fallbackPotImage);

                watch(heroImageSrc, () => {
                    heroImageLoaded.value = false;
                });

                const updatePotCover = async (imageUrl) => {
                    if (!potId.value) throw new Error('缺少花盆参数');
                    const res = await apiClient.updatePot(potId.value, { imageUrl });
                    if (!res?.success) throw new Error(res?.error || '设置封面失败');
                    return res;
                };

                const {
                    coverNotice,
                    isCoverUpdating,
                    shouldShowCoverAction,
                    canSetCover,
                    isCurrentCover,
                    setCurrentPreviewAsCover,
                    undoCoverChange
                } = MyFlowerPotsCover.createTimelineCoverController({ ref, computed, watch }, {
                    pot,
                    previewImages,
                    previewIndex,
                    canEditCover: () => isOwner.value && !isArchived.value,
                    updateCover: updatePotCover,
                    showAlert
                });

                const plantInfoGroups = computed(() => {
                    if (!plantInfo.value) return { priority: [], extended: [] };
                    const basic = plantInfo.value.basicInfo || {};
                    const extended = plantInfo.value.ornamentalFeatures || {};

                    const priority = [];
                    if (basic.family) priority.push({ label: '科属', val: basic.family });
                    if (basic.origin) priority.push({ label: '产地', val: basic.origin });
                    if (extended.category) priority.push({ label: '植物类型', val: extended.category });
                    if (extended.growthHabit) priority.push({ label: '生长习性', val: extended.growthHabit });

                    const ext = [];
                    if (extended.flowerColor) ext.push({ label: '花色', val: extended.flowerColor });
                    if (extended.floweringSeason) ext.push({ label: '花期', val: extended.floweringSeason });
                    if (extended.fragrance) ext.push({ label: '香气', val: extended.fragrance });
                    if (extended.symbolism) ext.push({ label: '寓意', val: extended.symbolism });

                    return { priority, extended: ext };
                });

                const careTipsGroups = computed(() => {
                    if (!plantInfo.value) return { summary: [], priorityDetails: [], extended: [] };
                    const guide = plantInfo.value.careGuide || {};

                    const summary = [];
                    if (guide.careDifficulty) summary.push({ label: '养护难度', val: guide.careDifficulty });
                    if (guide.temperature) summary.push({ label: '适宜温度', val: guide.temperature });

                    const priorityDetails = [];
                    if (guide.lightRequirement) priorityDetails.push({ label: '光照需求', val: guide.lightRequirement, icon: 'fa fa-sun' });
                    if (guide.watering) priorityDetails.push({ label: '浇水细节', val: guide.watering, icon: 'fa fa-tint' });
                    if (guide.soilRequirement) priorityDetails.push({ label: '土壤配比', val: guide.soilRequirement, icon: 'fa fa-mountain' });
                    if (guide.pruning) priorityDetails.push({ label: '剪枝修剪', val: guide.pruning, icon: 'fa fa-cut' });

                    const extended = [];
                    if (guide.fertilizing) extended.push({ label: '施肥建议', val: guide.fertilizing, icon: 'fa fa-seedling' });
                    if (guide.pests) extended.push({ label: '常见病虫', val: guide.pests, icon: 'fa fa-bug' });
                    if (guide.propagation) extended.push({ label: '繁殖方式', val: guide.propagation, icon: 'fa fa-leaf' });

                    return { summary, priorityDetails, extended };
                });

                return {
                    isLoading, pot, potId, isOwner, isArchived, isReadOnly, isPublicVisitor, canShowCareSchedules, showOperatorName, matchedPlantName, plantInfo,
                    pendingInvitePrompt,
                    isPlantInfoLoading, isCareRecordsLoading, isTimelineRecordsLoading, isPotStatsLoading, isCareSchedulesLoading, isCommentsLoading,
                    potStats, careRecords, timelineRecords, handleImageError, handleHeroImageLoad, handleHeroImageError, heroImageSrc, heroImageLoaded, showActionMenu, actionMenuButton, actionMenuPanel,
                    showAddTimelineModal, showShareModal, showPublicShareModal, showPublicQrCode, isPublicShareLoading, isSavingTimeline, isEditingTimeline, fileInput, archiveFileInput,
                    previewImages, previewIndex, currentPreviewItem, galleryIndicatorIndexes, galleryDragOffset, galleryIsDragging,
                    coverNotice, isCoverUpdating, shouldShowCoverAction, canSetCover, isCurrentCover, setCurrentPreviewAsCover, undoCoverChange,
                    newTimeline, sortedTimelineRecords, visibleTimelineRecords, isTimelineDesc,
                    hasDetailActivityNotice, detailActivityNoticeText, isTimelineActivityNew, getTimelineActivityLabel,
                    goBack, goEditPage, goAddCarePage, goCreatePot, confirmDeletePot, openArchiveModal, closeArchiveModal,
                    archiveCurrentPot, restoreArchivedPot, showArchiveModal, isArchiveLoading, archiveForm, archiveReasons,
                    archiveImageCount, triggerArchiveFileInput, onArchiveFilesSelected, removeArchiveImage,
                    openGallery, closeGallery, prevImg, nextImg, toggleTimelineSort,
                    handleGalleryTouchStart, handleGalleryTouchMove, handleGalleryTouchEnd,
                    openAddTimelineModal, openEditTimelineModal, closeTimelineModal, timelineImageCount,
                    triggerFileInput, onFilesSelected, removeExistingTimelineImage, removeNewImage, saveTimelineRecord, confirmDeleteTimeline,
                    formatDate, formatCommentTime, getImages, getCareTypeIcon, getCareTypeColor, getCareTypeLabel,
                    imgUrl, groupedCareRecords, activeCareDate, currentSheetGroup,
                    showCareDetails, closeCareDetails, goAddCarePageWithDate,
                    plantInfoActiveTab, showFullPlantInfo, showFullCareTips, plantInfoGroups, careTipsGroups,
                    statsWaterCount, statsFertilizeCount, statsCareCount, growthDurationDays, growthDurationText,
                    careSchedules, carePanelActiveTab, showCarePanelAddButton, carePanelAddLabel, handleCarePanelAdd,
                    groupedCareScheduleCards, showScheduleExpanded, showAddScheduleModal, newSchedule,
                    isEditingSchedule, scheduleModalTitle, scheduleModalConfirmLabel,
                    scheduleTypeOptions, scheduleIntervalPresets, setNewScheduleInterval, adjustNewScheduleInterval,
                    loadCareSchedules, saveNewSchedule, toggleScheduleEnabled, deleteSchedule, updateScheduleInterval,
                    openAddScheduleModal, openEditScheduleModal, closeScheduleModal,
                    getScheduleTypeStyle, getScheduleTypeName, getScheduleProgressMeta, scrollToSection, sectionTabs, activeSection,
                    editRecord, deleteRecord, viewAllRecords, viewAllTimelines, confirmingDeleteId,
                    cancelTransfer, rejectTransfer, acceptTransfer,
                    // 分享与协作
                    showShareModal, showMembersModal, showMemberInviteModal, showTransferModal,
                    openPublicShareModal, closePublicShareModal, returnToShareModal, togglePublicQrCode, enablePublicShare, disablePublicShare,
                    downloadQRCode, copyShareLink, sharePublicLink, copyCollaboratorInvite, copyViewerInvite,
                    shareAccessStates, handleShareAccessStateClick, getShareAccessStateClass, getShareAccessIconClass, getShareAccessStatusClass,
                    openMembersModal, closeMembersModal, returnToShareFromMembers, openMemberInvite, closeMemberInviteModal, returnToMembersFromInvite,
                    collaborators, viewers, memberTotalCount, activeMemberRole, setActiveMemberRole, activeMembers, activeMemberRoleLabel,
                    activeMemberRoleShortLabel, activeMemberDescription, activeMemberEmptyText, activeMemberInviteButtonLabel,
                    memberInviteRole, memberInviteEmail, isMemberInviteEmailValid, isMemberInviteLoading,
                    keyboardModalStyle, authKeyboardModalStyle, isAuthKeyboardActive, authKeyboardMode,
                    handleKeyboardFieldFocus, handleAuthKeyboardFieldFocus, handleAuthCompositionStart,
                    handleAuthCompositionEnd, handleAuthFocusOut, submitAuthFormFromEnter,
                    memberInviteDescription, memberInviteEmailButtonLabel, memberInviteLinkButtonLabel, memberInviteLinkDescription, memberInviteLinkExpiryText, setMemberInviteRole,
                    submitMemberEmailInvite, shareMemberInviteLink, activeMemberMenuId, memberRoleUpdatingUserId,
                    memberDisplayName, memberInitial, handleMemberAvatarError, getMemberMenuKey, toggleMemberMenu, changeMemberRole, removeMember,
                    removeCollaborator, addViewer, removeViewer, newViewerEmail,
                    showCommentModal, canReplyComment, canLeaveComment, showCommentEntry, canViewCommentDanmaku, canManageCommentDanmaku, shouldHideFloatingChrome, shouldShowCommentDanmaku, toggleCommentDanmaku,
                    commentForm, submitComment, isSubmittingComment, openCommentModal, closeCommentModal, beginReply, cancelReply, toggleCommentSort, canDeleteComment, deleteComment,
                    potComments, recentPotComments, replyTargetComment, showCommentDanmaku, barrageComments, commentSortOrder,
                    commentModalStyle, handleCommentInputFocus,
                    newCollaboratorEmail, addCollaborator,
                    selectedTransferUser, transferEmail, showTransferSuggestions, selectTransferCollab, initTransfer,
                    showAcceptTransferModal, transferPot, isAcceptingTransfer,
                    // Auth
                    showUserMenu, showLoginModal, showRegisterModal, showForgotPasswordModal,
                    isAuthLoading, loginForm, registerForm, loginErrors, registerErrors, forgotPasswordErrors, loginStatus, registerStatus, forgotPasswordStatus, passwordsMatch,
                    isForgotPasswordEmailValid, isLoginValid, isRegisterValid,
                    isTurnstileEnabled, isRegisterTurnstileReady, isForgotPasswordTurnstileReady,
                    isCollaboratorInviteEmailValid, isViewerInviteEmailValid, isTransferEmailValid,
                    syncLoginFormFromDom, syncRegisterFormFromDom, scheduleLoginAutofillSync,
                    validateLoginEmail, validateLoginPassword, validateForgotPasswordEmail,
                    validateRegisterEmail, validateRegisterPassword, validateRegisterConfirmPassword,
                    clearRegisterConfirmPassword,
                    handleLoginEmailInput, handleLoginPasswordInput, handleForgotPasswordEmailInput,
                    handleRegisterEmailInput, handleRegisterDisplayNameInput, handleRegisterPasswordInput, handleRegisterConfirmPasswordInput,
                    normalizeRegisterDisplayName,
                    handleLogin, handleForgotPassword, handleRegister, logout, goHome,
                    closeAuthModals, switchToRegister, switchToLogin, openInviteLogin, openInviteRegister, switchToForgotPassword,
                    userDisplayName, currentUser, commentInputRef, canUseNativeShare
                };
            }
        }).mount('#app');
