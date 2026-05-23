(function attachMyFlowerPotsGallery(global) {
    const createGallery = (refs, options = {}) => {
        const {
            previewImages,
            previewIndex,
            loadToken,
            dragOffset,
            isDragging
        } = refs;
        const media = global.MyFlowerPotsMedia;
        const thumbWidth = options.thumbWidth || 100;
        const thumbHeight = options.thumbHeight || 100;

        const buildGalleryItem = (src, previewSrc = '') => {
            const sourceItem = src && typeof src === 'object' ? src : { fullSrc: src };
            const fullSrc = String(sourceItem.fullSrc || sourceItem.src || sourceItem.url || '');
            const thumbSrc = sourceItem.previewSrc || sourceItem.thumbSrc || previewSrc || media.imgUrl(fullSrc, thumbWidth, thumbHeight) || fullSrc;
            return {
                ...sourceItem,
                fullSrc,
                previewSrc: thumbSrc,
                displaySrc: sourceItem.displaySrc || thumbSrc,
                isFullLoaded: sourceItem.isFullLoaded ?? (!fullSrc || thumbSrc === fullSrc),
                isFullLoading: sourceItem.isFullLoading ?? false,
                isFullLoadFailed: sourceItem.isFullLoadFailed ?? false
            };
        };

        const preloadGalleryImage = (index) => {
            const item = previewImages.value[index];
            if (!item || item.isFullLoaded || item.isFullLoading || !item.fullSrc) return;

            item.isFullLoading = true;
            item.isFullLoadFailed = false;
            const token = loadToken.value;
            const image = new Image();
            image.onload = () => {
                if (token !== loadToken.value) return;
                item.displaySrc = item.fullSrc;
                item.isFullLoaded = true;
                item.isFullLoading = false;
                item.isFullLoadFailed = false;
            };
            image.onerror = () => {
                if (token !== loadToken.value) return;
                item.isFullLoading = false;
                item.isFullLoadFailed = true;
            };
            image.src = item.fullSrc;
        };

        const preloadNearbyGalleryImages = () => {
            [previewIndex.value, previewIndex.value - 1, previewIndex.value + 1].forEach(preloadGalleryImage);
        };

        const findGalleryIndex = (images, img) => {
            const targetSrc = img && typeof img === 'object'
                ? String(img.fullSrc || img.src || img.url || '')
                : String(img || '');
            const exactIndex = images.indexOf(img);
            if (exactIndex >= 0) return exactIndex;
            return images.findIndex(item => {
                const sourceItem = item && typeof item === 'object' ? item : { fullSrc: item };
                return String(sourceItem.fullSrc || sourceItem.src || sourceItem.url || '') === targetSrc;
            });
        };

        const openGallery = (img, allImages, previewSrc = '') => {
            loadToken.value += 1;
            const images = Array.isArray(allImages) ? allImages : [];
            previewImages.value = images.map(src => buildGalleryItem(src, src === img ? previewSrc : ''));
            const idx = findGalleryIndex(images, img);
            previewIndex.value = idx >= 0 ? idx : 0;
            if (dragOffset) dragOffset.value = 0;
            if (isDragging) isDragging.value = false;
            preloadNearbyGalleryImages();
        };

        const closeGallery = () => {
            loadToken.value += 1;
            previewImages.value = [];
            previewIndex.value = 0;
            if (dragOffset) dragOffset.value = 0;
            if (isDragging) isDragging.value = false;
        };

        const prevImg = () => {
            if (previewIndex.value > 0) previewIndex.value--;
        };

        const nextImg = () => {
            if (previewIndex.value < previewImages.value.length - 1) previewIndex.value++;
        };

        return {
            buildGalleryItem,
            findGalleryIndex,
            preloadGalleryImage,
            preloadNearbyGalleryImages,
            openGallery,
            closeGallery,
            prevImg,
            nextImg
        };
    };

    const buildTimelineGalleryItems = (records, options = {}) => {
        const media = global.MyFlowerPotsMedia;
        const thumbWidth = options.thumbWidth || 100;
        const thumbHeight = options.thumbHeight || 100;
        const fallbackDescription = options.fallbackDescription ?? '';
        const items = [];

        (Array.isArray(records) ? records : []).forEach(record => {
            const images = media.parseImageList(record?.images);
            images.forEach(src => {
                const fullSrc = String(src || '');
                if (!fullSrc) return;
                items.push({
                    fullSrc,
                    previewSrc: media.imgUrl(fullSrc, thumbWidth, thumbHeight) || fullSrc,
                    timelineId: record?.id ?? record?.timelineId ?? null,
                    date: record?.date || '',
                    description: record?.description ?? fallbackDescription,
                    operatorName: record?.operatorName || record?.operator_name || ''
                });
            });
        });

        return items;
    };

    global.MyFlowerPotsGallery = {
        createGallery,
        buildTimelineGalleryItems
    };
})(window);
