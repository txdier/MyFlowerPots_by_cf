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

    global.MyFlowerPotsPotPermissions = {
        isArchivedPot,
        isOwner,
        canManageRecords,
        canEditPot,
        canViewPot,
        getReadOnlyReason
    };
})(window);
