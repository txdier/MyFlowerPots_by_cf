(function attachMyFlowerPotsCommentBarrage(global) {
    const REPLY_ROTATION_INTERVAL_MS = 5000;

    const trimComment = (content, maxLength) => {
        const normalized = (content || '').replace(/\s+/g, ' ').trim();
        if (normalized.length <= maxLength) return normalized;
        return `${normalized.slice(0, maxLength)}...`;
    };

    const hashCommentSeed = (value) => {
        let hash = 0;
        const input = String(value || '');
        for (let i = 0; i < input.length; i++) {
            hash = ((hash << 5) - hash) + input.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    };

    const normalizeReplies = (item) => {
        const replies = Array.isArray(item?.replies) ? item.replies.filter(Boolean) : [];
        if (replies.length > 0) return replies;
        return item?.latestReply ? [item.latestReply] : [];
    };

    const selectBarrageReply = (item, idx = 0, options = {}) => {
        const replies = normalizeReplies(item);
        if (replies.length === 0) return null;
        if (replies.length === 1) return replies[0];

        const rotationSlot = Number.isFinite(Number(options.rotationSlot))
            ? Number(options.rotationSlot)
            : 0;
        const slot = Math.max(0, Math.floor(rotationSlot));
        const replyIndex = (slot + idx) % replies.length;
        return replies[replyIndex];
    };

    const buildBarrageStyle = (item, idx = 0) => {
        const seed = hashCommentSeed(`${item?.id || idx}-${item?.createdAt || idx}`);
        const lane = seed % 4;
        const top = 12 + lane * 17 + (seed % 5);
        const duration = 12 + (seed % 9);
        const delay = -((seed % 5) * (duration / 6));
        return {
            top: `${top}%`,
            animationDelay: `${delay}s`,
            animationDuration: `${duration}s`
        };
    };

    const buildBarrageComment = (item, idx = 0, options = {}) => {
        const reply = selectBarrageReply(item, idx, options);
        return {
            ...item,
            key: `${item?.id || idx}-${item?.createdAt || idx}`,
            commentPreview: trimComment(item?.comment, options.commentMaxLength || 18),
            barrageReply: reply ? {
                ...reply,
                commentPreview: trimComment(reply.comment, options.replyMaxLength || 14)
            } : null,
            style: buildBarrageStyle(item, idx)
        };
    };

    const hasCommentAudience = (options = {}) => {
        const pot = options.pot || null;
        if (!pot) return false;
        const comments = Array.isArray(options.comments) ? options.comments : [];
        return !!(
            pot.is_shared ||
            Number(pot.collaborator_count || 0) > 0 ||
            Number(pot.viewer_count || 0) > 0 ||
            pot.is_collaborator ||
            pot.is_viewer ||
            options.viewerIsCollaborator ||
            options.viewerIsViewer ||
            comments.length > 0
        );
    };

    const canReplyComment = (options = {}) => !!(
        options.canCommentAsMember &&
        !options.isPublicVisitor &&
        !options.isArchived
    );

    global.MyFlowerPotsCommentBarrage = {
        REPLY_ROTATION_INTERVAL_MS,
        trimComment,
        hashCommentSeed,
        selectBarrageReply,
        buildBarrageStyle,
        buildBarrageComment,
        hasCommentAudience,
        canReplyComment
    };
})(window);
