(function attachMyFlowerPotsMedia(global) {
    const DEFAULT_REMOTE_IMAGE_HOST = 'img.kaside365.com';
    const DEFAULT_POT_IMAGE = 'assets/images/icons/icons-default-pot.png';
    const SMALL_IMAGE_MAX_SIDE = 128;

    const normalizeAssetPath = (src) => String(src || '')
        .replace(/^\/?assets\/deom\//i, '/assets/demo/')
        .replace(/^assets\//i, '/assets/');

    const normalizeResizeDimension = (value) => {
        const dimension = Number(value);
        if (!Number.isFinite(dimension) || dimension <= 0) return value;
        if (dimension <= 48) return 64;
        if (dimension <= 80) return 80;
        if (dimension <= SMALL_IMAGE_MAX_SIDE) return SMALL_IMAGE_MAX_SIDE;
        return Math.round(dimension);
    };

    const imgUrl = (src, width, height, options = {}) => {
        if (!src) return src;
        const remoteHost = options.remoteHost || DEFAULT_REMOTE_IMAGE_HOST;
        const normalizedSrc = normalizeAssetPath(src);
        if (normalizedSrc.startsWith('/assets/')) return normalizedSrc;
        if (!normalizedSrc.includes(remoteHost)) return normalizedSrc;
        const resizeWidth = normalizeResizeDimension(width);
        const resizeHeight = normalizeResizeDimension(height);
        const maxSide = Math.max(Number(resizeWidth) || 0, Number(resizeHeight) || 0);
        const format = options.format || (maxSide > 0 && maxSide <= SMALL_IMAGE_MAX_SIDE ? 'webp' : 'auto');
        return `/cdn-cgi/image/width=${resizeWidth},height=${resizeHeight},dpr=2,fit=cover,format=${format}/${normalizedSrc}`;
    };

    const parseImageList = (value) => {
        if (!value) return [];
        if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
        const text = String(value || '').trim();
        if (!text) return [];
        try {
            const parsed = JSON.parse(text);
            return Array.isArray(parsed)
                ? parsed.map(item => String(item || '').trim()).filter(Boolean)
                : [text];
        } catch {
            return [text];
        }
    };

    const readImagePreview = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target?.result || '');
        reader.onerror = () => reject(reader.error || new Error('Failed to read image preview'));
        reader.readAsDataURL(file);
    });

    const compressImage = (file, options = {}) => {
        const maxSide = Number(options.maxSide || 1920);
        const quality = Number(options.quality ?? 0.85);
        if (!file || file.type === 'image/gif') return Promise.resolve(file);

        return new Promise((resolve) => {
            const image = new Image();
            const objectUrl = URL.createObjectURL(file);

            image.onload = () => {
                URL.revokeObjectURL(objectUrl);
                let { width, height } = image;
                if (width > maxSide || height > maxSide) {
                    if (width >= height) {
                        height = Math.round(height * maxSide / width);
                        width = maxSide;
                    } else {
                        width = Math.round(width * maxSide / height);
                        height = maxSide;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(image, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (!blob) {
                        resolve(file);
                        return;
                    }
                    resolve(new File(
                        [blob],
                        file.name.replace(/\.[^.]+$/, '.jpg'),
                        { type: 'image/jpeg' }
                    ));
                }, 'image/jpeg', quality);
            };

            image.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                resolve(file);
            };

            image.src = objectUrl;
        });
    };

    const filesFromInputEvent = (event) => Array.from(event?.target?.files || []);

    const selectImages = async (event, options = {}) => {
        const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : Infinity;
        const files = filesFromInputEvent(event).slice(0, Math.max(0, limit));
        const compressOptions = {
            maxSide: options.maxSide || 1920,
            quality: options.quality ?? 0.85
        };
        const items = [];

        for (const file of files) {
            const compressed = await compressImage(file, compressOptions);
            const preview = await readImagePreview(compressed);
            items.push({ file: compressed, preview });
        }

        if (event?.target) event.target.value = '';
        return items;
    };

    const uploadImages = async (apiClient, items, options = {}) => {
        const uploadedUrls = [];
        for (const item of items || []) {
            if (!item?.file) continue;
            const response = await apiClient.uploadImage(item.file, options);
            if (response.success && response.data?.url) {
                uploadedUrls.push(response.data.url);
            }
        }
        return uploadedUrls;
    };

    const setImageFallback = (event, fallback = DEFAULT_POT_IMAGE) => {
        if (event?.target) {
            event.target.src = fallback;
        }
    };

    global.MyFlowerPotsMedia = {
        DEFAULT_POT_IMAGE,
        imgUrl,
        parseImageList,
        readImagePreview,
        compressImage,
        selectImages,
        uploadImages,
        setImageFallback
    };
})(window);
