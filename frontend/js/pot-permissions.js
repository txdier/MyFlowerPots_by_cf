(function attachMyFlowerPotsPotPermissions(global) {
    const getCurrentUserId = () => global.apiClient?.userId || global.authStorage?.getUserId?.() || null;

    const isArchivedPot = (pot) => String(pot?.status || 'active').toLowerCase() === 'archived';

    const getPotOwnerId = (pot) => pot?.user_id || pot?.userId || null;

    const isOwner = (pot, userId = getCurrentUserId()) => !!(
        pot &&
        getPotOwnerId(pot) &&
        userId &&
        getPotOwnerId(pot) === userId
    );

    const canManageRecords = (pot, userId = getCurrentUserId()) => !!(
        pot &&
        !isArchivedPot(pot) &&
        (isOwner(pot, userId) || pot.is_collaborator || pot.isCollaborator)
    );

    const canEditPot = (pot, userId = getCurrentUserId()) => !!(
        pot &&
        !isArchivedPot(pot) &&
        isOwner(pot, userId)
    );

    const canViewPot = (pot, userId = getCurrentUserId()) => !!(
        pot &&
        (isOwner(pot, userId) || pot.is_collaborator || pot.is_viewer || pot.isCollaborator || pot.isViewer)
    );

    const getReadOnlyReason = (pot, options = {}) => {
        if (isArchivedPot(pot)) return options.archived || '已归档植物为只读状态。';
        if (pot?.is_viewer || pot?.isViewer) return options.viewer || '仅查看权限不能编辑。';
        return options.defaultReason || '当前权限不能编辑。';
    };

    const formatMemberCount = (count) => `${Math.max(0, Number(count) || 0)}人`;

    const getShareAccessStates = ({
        isShared = false,
        isArchived = false,
        viewerCount = 0,
        collaboratorCount = 0
    } = {}) => ([
        {
            key: 'public',
            label: '公开链接',
            icon: 'fa-link',
            statusText: isShared ? '已开启' : '未开启',
            description: '无需登录；只能查看公开页面；不会成为成员',
            disabled: false
        },
        {
            key: 'viewer',
            label: '仅查看成员',
            icon: 'fa-book-open',
            statusText: formatMemberCount(viewerCount),
            description: '登录成员可查看记录和留言，不能编辑',
            disabled: false
        },
        {
            key: 'collaborator',
            label: '共同照料成员',
            icon: 'fa-handshake',
            statusText: isArchived ? '归档不可用' : formatMemberCount(collaboratorCount),
            description: isArchived ? '归档后不能共同照料或编辑' : '登录成员可新增和编辑养护、时间线、提醒',
            disabled: !!isArchived
        }
    ]);

    global.MyFlowerPotsPotPermissions = {
        isArchivedPot,
        isOwner,
        canManageRecords,
        canEditPot,
        canViewPot,
        getReadOnlyReason,
        getShareAccessStates
    };
})(window);
