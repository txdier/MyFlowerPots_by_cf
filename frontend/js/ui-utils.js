(function attachMyFlowerPotsUi(global) {
    const TOAST_ICONS = {
        success: 'fa fa-check-circle',
        error: 'fa fa-exclamation-circle',
        info: 'fa fa-info-circle',
        warning: 'fa fa-exclamation-triangle'
    };

    const inferToastTypeFromIcon = (icon, fallback = 'info') => {
        const text = String(icon || '');
        if (/check|success/i.test(text)) return 'success';
        if (/error|exclamation|trash|times|warning|triangle/i.test(text)) return 'error';
        return fallback;
    };

    const resolveToastPayload = (message, typeOrIcon = 'success', options = {}) => {
        const defaultType = options.defaultType || 'success';
        const value = String(typeOrIcon || defaultType);
        const isIcon = /\bfa\b/.test(value);
        const type = isIcon ? inferToastTypeFromIcon(value, defaultType) : value;
        const icon = isIcon ? value : (options.icons?.[type] || TOAST_ICONS[type] || TOAST_ICONS.info);

        return {
            show: true,
            message,
            type,
            icon
        };
    };

    const createToast = (toastRef, options = {}) => {
        let timer = null;
        const duration = Number(options.duration || 2200);

        const showToast = (message, typeOrIcon = options.defaultType || 'success') => {
            if (!toastRef) return;
            toastRef.value = resolveToastPayload(message, typeOrIcon, options);
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                if (toastRef.value) {
                    toastRef.value.show = false;
                }
            }, duration);
        };

        showToast.clear = () => {
            if (timer) clearTimeout(timer);
            timer = null;
            if (toastRef.value) {
                toastRef.value.show = false;
            }
        };

        return showToast;
    };

    const formatEmailSender = (addr) => {
        const text = String(addr || '');
        const match = text.match(/^(.+?)\s*<.+>$/);
        return match ? match[1].trim() : text.split('@')[0];
    };

    const sanitizeHtml = (html) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(String(html || ''), 'text/html');

        doc.querySelectorAll('script, iframe, object, embed, base, form, meta, link').forEach(node => node.remove());

        doc.querySelectorAll('*').forEach(node => {
            Array.from(node.attributes).forEach(attr => {
                const name = attr.name.toLowerCase();
                const value = String(attr.value || '').trim();

                if (name.startsWith('on') || name === 'srcdoc' || name === 'formaction') {
                    node.removeAttribute(attr.name);
                    return;
                }

                if (
                    ['href', 'src', 'xlink:href'].includes(name) &&
                    /^(javascript:|vbscript:|data:text\/html)/i.test(value)
                ) {
                    node.removeAttribute(attr.name);
                }
            });
        });

        return doc.body.innerHTML;
    };

    global.MyFlowerPotsUi = {
        createToast,
        formatEmailSender,
        sanitizeHtml
    };
})(window);
