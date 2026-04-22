(function attachMyFlowerPotsTimeline(global) {
    const buildTimelinePayload = ({ date, description, existingImages = [], uploadedUrls = [] }) => ({
        date,
        description: String(description || '').trim(),
        images: [...existingImages, ...uploadedUrls]
    });

    const saveTimelineForm = async (apiClient, options = {}) => {
        const {
            potId,
            timelineId = null,
            date,
            description = '',
            existingImages = [],
            tempImages = []
        } = options;

        const uploadedUrls = await global.MyFlowerPotsMedia.uploadImages(apiClient, tempImages, {
            potId,
            uploadType: 'timeline'
        });
        const payload = buildTimelinePayload({ date, description, existingImages, uploadedUrls });

        return timelineId
            ? apiClient.updateTimeline(timelineId, payload)
            : apiClient.createTimeline({ potId, ...payload });
    };

    global.MyFlowerPotsTimeline = {
        buildTimelinePayload,
        saveTimelineForm
    };
})(window);
