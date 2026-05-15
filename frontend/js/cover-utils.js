(function attachMyFlowerPotsCover(global) {
    const normalizeCoverUrl = (url) => String(url || '').trim();

    const readBooleanSource = (source) => {
        if (typeof source === 'function') return !!source();
        if (source && typeof source === 'object' && 'value' in source) return !!source.value;
        return !!source;
    };

    const createTimelineCoverController = (vue, options = {}) => {
        const { ref, computed, watch } = vue;
        const {
            pot,
            previewImages,
            previewIndex,
            canEditCover,
            updateCover,
            showAlert,
            undoDuration = 7500
        } = options;

        const coverNotice = ref({ show: false, message: '', canUndo: false });
        const isCoverUpdating = ref(false);
        let coverUndo = null;
        let undoTimer = null;

        const currentPreviewImageUrl = computed(() => {
            const item = previewImages.value?.[previewIndex.value];
            return normalizeCoverUrl(item?.fullSrc);
        });

        const currentCoverUrl = computed(() =>
            normalizeCoverUrl(pot.value?.image_url || pot.value?.imageUrl)
        );

        const canEditCoverNow = () => readBooleanSource(canEditCover);

        const shouldShowCoverAction = computed(() =>
            !!(canEditCoverNow() && currentPreviewImageUrl.value)
        );

        const isCurrentCover = computed(() =>
            !!(currentPreviewImageUrl.value && currentPreviewImageUrl.value === currentCoverUrl.value)
        );

        const canSetCover = computed(() =>
            !!(shouldShowCoverAction.value && !isCurrentCover.value)
        );

        const hideNoticeSoon = (delay = 2200) => {
            if (undoTimer) clearTimeout(undoTimer);
            undoTimer = setTimeout(() => {
                coverNotice.value = { show: false, message: '', canUndo: false };
                undoTimer = null;
            }, delay);
        };

        const clearCoverUndo = () => {
            if (undoTimer) clearTimeout(undoTimer);
            undoTimer = null;
            coverUndo = null;
            coverNotice.value = { show: false, message: '', canUndo: false };
        };

        const showUndoNotice = (previousUrl, nextUrl) => {
            if (undoTimer) clearTimeout(undoTimer);
            coverUndo = { previousUrl, nextUrl };
            coverNotice.value = { show: true, message: '已设为花盆封面', canUndo: true };
            undoTimer = setTimeout(() => {
                clearCoverUndo();
            }, undoDuration);
        };

        const setCurrentPreviewAsCover = async () => {
            if (!canSetCover.value || isCoverUpdating.value || typeof updateCover !== 'function') return;
            const nextUrl = currentPreviewImageUrl.value;
            const previousUrl = currentCoverUrl.value;
            isCoverUpdating.value = true;
            try {
                await updateCover(nextUrl);
                if (pot.value) pot.value.image_url = nextUrl;
                showUndoNotice(previousUrl, nextUrl);
            } catch (error) {
                showAlert?.(`设置封面失败: ${error?.message || '请稍后重试'}`);
            } finally {
                isCoverUpdating.value = false;
            }
        };

        const undoCoverChange = async () => {
            if (!coverUndo || typeof updateCover !== 'function') return;
            const previousUrl = coverUndo.previousUrl;
            isCoverUpdating.value = true;
            try {
                await updateCover(previousUrl);
                if (pot.value) pot.value.image_url = previousUrl;
                clearCoverUndo();
                coverNotice.value = { show: true, message: '已恢复原封面', canUndo: false };
                hideNoticeSoon();
            } catch (error) {
                showAlert?.(`撤销失败: ${error?.message || '请稍后重试'}`);
            } finally {
                isCoverUpdating.value = false;
            }
        };

        if (typeof watch === 'function') {
            watch(previewIndex, clearCoverUndo);
            watch(() => previewImages.value.length, (length) => {
                if (!length) clearCoverUndo();
            });
        }

        return {
            coverNotice,
            isCoverUpdating,
            shouldShowCoverAction,
            canSetCover,
            isCurrentCover,
            setCurrentPreviewAsCover,
            undoCoverChange,
            clearCoverUndo
        };
    };

    global.MyFlowerPotsCover = {
        createTimelineCoverController
    };
})(window);
