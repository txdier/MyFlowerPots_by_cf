(function attachMyFlowerPotsFormUtils(global) {
    const normalizeSingleLineText = (value) => String(value || '')
        .replace(/\s+/g, ' ')
        .trim();

    const normalizeEmail = (value) => normalizeSingleLineText(value).toLowerCase();

    const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));

    const isValidPassword = (value, minLength = 8) => String(value || '').length >= minLength;

    const getEmailError = (value, options = {}) => {
        const normalized = normalizeEmail(value);
        if (!normalized) {
            return options.required === false ? '' : (options.requiredMessage || '请输入邮箱地址');
        }
        return isValidEmail(normalized) ? '' : (options.invalidMessage || '请输入正确的邮箱地址');
    };

    const getPasswordError = (value, options = {}) => {
        const raw = String(value || '');
        const minLength = Number(options.minLength || 8);
        if (!raw) {
            return options.required === false ? '' : (options.requiredMessage || '请输入密码');
        }
        if (raw.length < minLength) {
            return options.tooShortMessage || ("密码至少 " + minLength + " 位");
        }
        return '';
    };

    const syncFormFieldsFromDom = (fields) => {
        (fields || []).forEach(({ elementId, form, key, transform }) => {
            const input = document.getElementById(elementId);
            if (!input || typeof input.value !== 'string' || !form || !key) return;
            const rawValue = input.value;
            const nextValue = typeof transform === 'function' ? transform(rawValue) : rawValue;
            if (form[key] !== nextValue) {
                form[key] = nextValue;
            }
        });
    };

    global.MyFlowerPotsFormUtils = {
        normalizeSingleLineText,
        normalizeEmail,
        isValidEmail,
        isValidPassword,
        getEmailError,
        getPasswordError,
        syncFormFieldsFromDom
    };
})(window);
