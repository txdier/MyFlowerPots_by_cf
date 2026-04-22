(function attachMyFlowerPotsArchive(global) {
    const DEFAULT_ARCHIVE_REASON = '枯萎';

    const resetArchiveForm = (form, fileInput = null, options = {}) => {
        form.reason = options.defaultReason || DEFAULT_ARCHIVE_REASON;
        form.note = '';
        form.tempImages = [];
        if (fileInput?.value) fileInput.value.value = '';
        else if (fileInput) fileInput.value = '';
    };

    const archiveImageCount = (form) => (form.tempImages || []).length;

    const selectArchiveImages = async (event, form, options = {}) => {
        const maxImages = Number(options.maxImages || 3);
        const remaining = maxImages - archiveImageCount(form);
        if (remaining <= 0) {
            if (event?.target) event.target.value = '';
            return [];
        }
        const items = await global.MyFlowerPotsMedia.selectImages(event, {
            limit: remaining,
            maxSide: options.maxSide || 1920,
            quality: options.quality ?? 0.85
        });
        form.tempImages.push(...items);
        return items;
    };

    const uploadArchiveImagesForPot = async (apiClient, form, potId) =>
        global.MyFlowerPotsMedia.uploadImages(apiClient, form.tempImages || [], {
            potId,
            uploadType: 'timeline'
        });

    const uploadArchiveImagesByPotId = async (apiClient, form, pots) => {
        const imagesByPotId = {};
        if (!form.tempImages || form.tempImages.length === 0) return imagesByPotId;
        for (const pot of pots || []) {
            imagesByPotId[pot.id] = await uploadArchiveImagesForPot(apiClient, form, pot.id);
        }
        return imagesByPotId;
    };

    global.MyFlowerPotsArchive = {
        DEFAULT_ARCHIVE_REASON,
        resetArchiveForm,
        archiveImageCount,
        selectArchiveImages,
        uploadArchiveImagesForPot,
        uploadArchiveImagesByPotId
    };
})(window);
