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
            const fullSrc = String(src || '');
            const thumbSrc = previewSrc || media.imgUrl(fullSrc, thumbWidth, thumbHeight) || fullSrc;
            return {
                fullSrc,
                previewSrc: thumbSrc,
                displaySrc: thumbSrc,
                isFullLoaded: !fullSrc || thumbSrc === fullSrc,
                isFullLoading: false,
                isFullLoadFailed: false
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

        const openGallery = (img, allImages, previewSrc = '') => {
            loadToken.value += 1;
            const images = Array.isArray(allImages) ? allImages : [];
            previewImages.value = images.map(src => buildGalleryItem(src, src === img ? previewSrc : ''));
            const idx = images.indexOf(img);
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
            preloadGalleryImage,
            preloadNearbyGalleryImages,
            openGallery,
            closeGallery,
            prevImg,
            nextImg
        };
    };

    global.MyFlowerPotsGallery = {
        createGallery
    };
})(window);
