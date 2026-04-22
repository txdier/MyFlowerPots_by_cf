(function attachMyFlowerPotsFormUtils(global) {
    const DISPLAY_NAME_MAX_LENGTH = 12;

    const normalizeSingleLineText = (value) => String(value || '')
        .replace(/\s+/g, ' ')
        .trim();

    const limitTextLength = (value, maxLength) => Array.from(String(value || ''))
        .slice(0, maxLength)
        .join('');

    const getDisplayWidth = (char) => /^[\x00-\x7F]$/.test(char) ? 0.5 : 1;

    const limitTextDisplayWidth = (value, maxWidth) => {
        let width = 0;
        let output = '';
        for (const char of Array.from(String(value || ''))) {
            const charWidth = getDisplayWidth(char);
            if (width + charWidth > maxWidth) break;
            width += charWidth;
            output += char;
        }
        return output;
    };

    const normalizeDisplayName = (value, maxLength = DISPLAY_NAME_MAX_LENGTH) =>
        limitTextLength(normalizeSingleLineText(value), maxLength);

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

    const focusFieldById = async (elementId, nextTickFn = null) => {
        if (typeof nextTickFn === 'function') {
            await nextTickFn();
        }
        const input = document.getElementById(elementId);
        if (typeof input?.focus === 'function') {
            input.focus();
        }
    };

    const createAuthFormController = (options = {}) => {
        const {
            reactive,
            computed,
            nextTick,
            ids = {},
            autofillDurationMs = 12000,
            autofillIntervalMs = 250,
            autofillDelays = [80, 250, 800, 1600]
        } = options;

        if (typeof reactive !== 'function' || typeof computed !== 'function' || typeof nextTick !== 'function') {
            throw new Error('createAuthFormController requires Vue reactive, computed, and nextTick helpers');
        }

        const fieldIds = {
            loginEmail: 'loginEmail',
            loginPassword: 'loginPassword',
            registerEmail: 'registerEmail',
            registerDisplayName: 'registerNickname',
            registerPassword: 'registerPassword',
            registerConfirmPassword: 'registerConfirmPassword',
            ...ids
        };

        const loginForm = reactive({ email: '', password: '' });
        const registerForm = reactive({
            email: '',
            password: '',
            confirmPassword: '',
            displayName: ''
        });
        const loginErrors = reactive({ email: '', password: '' });
        const registerErrors = reactive({ email: '', password: '', confirmPassword: '' });
        const forgotPasswordErrors = reactive({ email: '' });
        const loginStatus = reactive({ type: '', message: '' });
        const registerStatus = reactive({ type: '', message: '' });
        const forgotPasswordStatus = reactive({ type: '', message: '' });

        const passwordsMatch = computed(() =>
            !!registerForm.password &&
            !!registerForm.confirmPassword &&
            registerForm.password === registerForm.confirmPassword
        );

        const isForgotPasswordEmailValid = computed(() => isValidEmail(loginForm.email));

        const isLoginValid = computed(() =>
            isValidEmail(loginForm.email) &&
            loginForm.password.length > 0
        );

        const isRegisterValid = computed(() =>
            isValidEmail(registerForm.email) &&
            isValidPassword(registerForm.password) &&
            !!registerForm.confirmPassword &&
            passwordsMatch.value
        );

        const clearStatus = (status) => {
            if (!status) return;
            status.type = '';
            status.message = '';
        };

        const clearAuthFeedback = () => {
            loginErrors.email = '';
            loginErrors.password = '';
            registerErrors.email = '';
            registerErrors.password = '';
            registerErrors.confirmPassword = '';
            forgotPasswordErrors.email = '';
            clearStatus(loginStatus);
            clearStatus(registerStatus);
            clearStatus(forgotPasswordStatus);
        };

        const syncLoginFormFromDom = () => {
            syncFormFieldsFromDom([
                { elementId: fieldIds.loginEmail, form: loginForm, key: 'email', transform: normalizeEmail },
                { elementId: fieldIds.loginPassword, form: loginForm, key: 'password' }
            ]);
        };

        const syncRegisterFormFromDom = () => {
            syncFormFieldsFromDom([
                { elementId: fieldIds.registerEmail, form: registerForm, key: 'email', transform: normalizeEmail },
                { elementId: fieldIds.registerDisplayName, form: registerForm, key: 'displayName', transform: normalizeDisplayName },
                { elementId: fieldIds.registerPassword, form: registerForm, key: 'password' },
                { elementId: fieldIds.registerConfirmPassword, form: registerForm, key: 'confirmPassword' }
            ]);
        };

        let loginAutofillSyncInterval = null;
        let loginAutofillSyncStopTimer = null;

        const stopLoginAutofillWatcher = () => {
            if (loginAutofillSyncInterval) {
                window.clearInterval(loginAutofillSyncInterval);
                loginAutofillSyncInterval = null;
            }
            if (loginAutofillSyncStopTimer) {
                window.clearTimeout(loginAutofillSyncStopTimer);
                loginAutofillSyncStopTimer = null;
            }
        };

        const startLoginAutofillWatcher = (durationMs = autofillDurationMs) => {
            stopLoginAutofillWatcher();
            syncLoginFormFromDom();
            loginAutofillSyncInterval = window.setInterval(syncLoginFormFromDom, autofillIntervalMs);
            loginAutofillSyncStopTimer = window.setTimeout(() => {
                stopLoginAutofillWatcher();
            }, durationMs);
        };

        const scheduleLoginAutofillSync = async () => {
            await nextTick();
            startLoginAutofillWatcher();
            autofillDelays.forEach(delay => window.setTimeout(syncLoginFormFromDom, delay));
        };

        const scheduleRegisterAutofillSync = async () => {
            await nextTick();
            autofillDelays.forEach(delay => window.setTimeout(syncRegisterFormFromDom, delay));
        };

        const focusAuthFieldById = (elementId) => focusFieldById(elementId, nextTick);

        const validateLoginEmail = (showRequired = false) => {
            loginForm.email = normalizeEmail(loginForm.email);
            loginErrors.email = getEmailError(loginForm.email, { required: showRequired });
            return !loginErrors.email;
        };

        const validateLoginPassword = (showRequired = false) => {
            loginErrors.password = loginForm.password
                ? ''
                : (showRequired ? '请输入密码' : '');
            return !loginErrors.password;
        };

        const validateForgotPasswordEmail = (showRequired = false) => {
            loginForm.email = normalizeEmail(loginForm.email);
            forgotPasswordErrors.email = getEmailError(loginForm.email, { required: showRequired });
            return !forgotPasswordErrors.email;
        };

        const validateRegisterEmail = (showRequired = false) => {
            registerForm.email = normalizeEmail(registerForm.email);
            registerErrors.email = getEmailError(registerForm.email, { required: showRequired });
            return !registerErrors.email;
        };

        const validateRegisterPassword = (showRequired = false) => {
            registerErrors.password = getPasswordError(registerForm.password, {
                required: showRequired,
                requiredMessage: '请输入密码',
                tooShortMessage: '密码至少 8 位'
            });
            return !registerErrors.password;
        };

        const validateRegisterConfirmPassword = (showRequired = false) => {
            if (!registerForm.confirmPassword) {
                registerErrors.confirmPassword = showRequired ? '请再次输入密码' : '';
                return !registerErrors.confirmPassword;
            }
            registerErrors.confirmPassword = passwordsMatch.value ? '' : '两次输入的密码不一致';
            return !registerErrors.confirmPassword;
        };

        const normalizeRegisterDisplayName = () => {
            registerForm.displayName = normalizeDisplayName(registerForm.displayName);
        };

        const handleLoginEmailInput = () => {
            clearStatus(loginStatus);
            if (!loginForm.email) {
                loginErrors.email = '';
                return;
            }
            validateLoginEmail(false);
        };

        const handleLoginPasswordInput = () => {
            clearStatus(loginStatus);
            if (!loginForm.password) {
                loginErrors.password = '';
                return;
            }
            validateLoginPassword(false);
        };

        const handleForgotPasswordEmailInput = () => {
            clearStatus(forgotPasswordStatus);
            if (!loginForm.email) {
                forgotPasswordErrors.email = '';
                return;
            }
            validateForgotPasswordEmail(false);
        };

        const handleRegisterEmailInput = () => {
            clearStatus(registerStatus);
            if (!registerForm.email) {
                registerErrors.email = '';
                return;
            }
            validateRegisterEmail(false);
        };

        const handleRegisterDisplayNameInput = () => {
            clearStatus(registerStatus);
            registerForm.displayName = normalizeDisplayName(registerForm.displayName);
        };

        const handleRegisterPasswordInput = () => {
            clearStatus(registerStatus);
            validateRegisterPassword(false);
            if (registerForm.confirmPassword) {
                validateRegisterConfirmPassword(false);
            } else {
                registerErrors.confirmPassword = '';
            }
        };

        const handleRegisterConfirmPasswordInput = () => {
            clearStatus(registerStatus);
            validateRegisterConfirmPassword(false);
        };

        const validateLoginForm = async () => {
            syncLoginFormFromDom();
            clearStatus(loginStatus);

            const emailValid = validateLoginEmail(true);
            const passwordValid = validateLoginPassword(true);

            if (!emailValid) {
                await focusAuthFieldById(fieldIds.loginEmail);
                return false;
            }

            if (!passwordValid) {
                await focusAuthFieldById(fieldIds.loginPassword);
                return false;
            }

            return true;
        };

        const validateRegisterForm = async () => {
            syncRegisterFormFromDom();
            normalizeRegisterDisplayName();
            clearStatus(registerStatus);

            const emailValid = validateRegisterEmail(true);
            const passwordValid = validateRegisterPassword(true);
            const confirmPasswordValid = validateRegisterConfirmPassword(true);

            if (!emailValid) {
                await focusAuthFieldById(fieldIds.registerEmail);
                return false;
            }

            if (!passwordValid) {
                await focusAuthFieldById(fieldIds.registerPassword);
                return false;
            }

            if (!confirmPasswordValid) {
                await focusAuthFieldById(fieldIds.registerConfirmPassword);
                return false;
            }

            return true;
        };

        return {
            loginForm,
            registerForm,
            loginErrors,
            registerErrors,
            forgotPasswordErrors,
            loginStatus,
            registerStatus,
            forgotPasswordStatus,
            passwordsMatch,
            isForgotPasswordEmailValid,
            isLoginValid,
            isRegisterValid,
            clearStatus,
            clearAuthFeedback,
            syncLoginFormFromDom,
            syncRegisterFormFromDom,
            stopLoginAutofillWatcher,
            startLoginAutofillWatcher,
            scheduleLoginAutofillSync,
            scheduleRegisterAutofillSync,
            focusFieldById: focusAuthFieldById,
            validateLoginEmail,
            validateLoginPassword,
            validateForgotPasswordEmail,
            validateRegisterEmail,
            validateRegisterPassword,
            validateRegisterConfirmPassword,
            normalizeRegisterDisplayName,
            handleLoginEmailInput,
            handleLoginPasswordInput,
            handleForgotPasswordEmailInput,
            handleRegisterEmailInput,
            handleRegisterDisplayNameInput,
            handleRegisterPasswordInput,
            handleRegisterConfirmPasswordInput,
            validateLoginForm,
            validateRegisterForm
        };
    };

    global.MyFlowerPotsFormUtils = {
        normalizeSingleLineText,
        normalizeDisplayName,
        limitTextLength,
        limitTextDisplayWidth,
        DISPLAY_NAME_MAX_LENGTH,
        normalizeEmail,
        isValidEmail,
        isValidPassword,
        getEmailError,
        getPasswordError,
        syncFormFieldsFromDom,
        focusFieldById,
        createAuthFormController
    };
})(window);
