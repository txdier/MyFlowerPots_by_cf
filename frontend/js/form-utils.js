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

    const hasPasswordLetter = (value) => /[A-Za-z]/.test(String(value || ''));
    const hasPasswordNumber = (value) => /\d/.test(String(value || ''));
    const isValidPassword = (value, minLength = 8) => {
        const raw = String(value || '');
        return raw.length >= minLength && hasPasswordLetter(raw) && hasPasswordNumber(raw);
    };

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
        if (!hasPasswordLetter(raw) || !hasPasswordNumber(raw)) {
            return options.weakMessage || '密码需同时包含字母和数字';
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

    const isKeyboardFocusableField = (element) => !!(
        element?.matches?.('input, textarea, select, [contenteditable="true"]')
    );

    const isElementOutsideVisualViewport = (element, options = {}) => {
        if (!element || typeof element.getBoundingClientRect !== 'function') return true;
        const rect = element.getBoundingClientRect();
        const topInset = Number.isFinite(Number(options.topInset)) ? Number(options.topInset) : 16;
        const bottomInset = Number.isFinite(Number(options.bottomInset)) ? Number(options.bottomInset) : 16;
        const viewportTop = Math.round(window.visualViewport?.offsetTop || 0);
        const viewportHeight = Math.round(window.visualViewport?.height || window.innerHeight || 0);
        const viewportBottom = viewportTop + viewportHeight;
        return rect.top < viewportTop + topInset || rect.bottom > viewportBottom - bottomInset;
    };

    const scrollFieldIntoView = (element, options = {}) => {
        if (!element || typeof element.scrollIntoView !== 'function') return;
        const delayMs = Number.isFinite(Number(options.delayMs)) ? Number(options.delayMs) : 180;
        const repeatDelayMs = Number.isFinite(Number(options.repeatDelayMs)) ? Number(options.repeatDelayMs) : 0;
        const doScroll = () => {
            if (typeof options.shouldSkip === 'function' && options.shouldSkip()) return;
            if (options.ifNeeded && !isElementOutsideVisualViewport(element, options)) return;
            element.scrollIntoView({
                block: options.block || 'center',
                inline: options.inline || 'nearest',
                behavior: options.behavior || 'smooth'
            });
        };
        window.setTimeout(() => {
            doScroll();
            if (repeatDelayMs > 0) {
                window.setTimeout(doScroll, repeatDelayMs);
            }
        }, delayMs);
    };

    const focusFieldById = async (elementId, nextTickFn = null, options = {}) => {
        if (typeof nextTickFn === 'function') {
            await nextTickFn();
        }
        const input = document.getElementById(elementId);
        if (typeof input?.focus === 'function') {
            if (options.preventScroll) {
                try {
                    input.focus({ preventScroll: true });
                } catch (e) {
                    input.focus();
                }
            } else {
                input.focus();
            }
            if (options.scrollIntoView) {
                scrollFieldIntoView(input, options);
            }
        }
    };

    const createKeyboardViewportController = (options = {}) => {
        const {
            ref,
            computed,
            onMounted,
            onUnmounted,
            compactWidth = 640,
            compactSpacing = 8,
            regularSpacing = 32,
            minHeight = 280,
            maxHeightCss = '56rem',
            focusScrollDelayMs = 180,
            keyboardActivationThreshold = 120,
            authTopGap = 4,
            authBottomGap = 4,
            authFocusOutResetDelayMs = 180
        } = options;

        if (typeof ref !== 'function' || typeof computed !== 'function') {
            throw new Error('createKeyboardViewportController requires Vue ref and computed helpers');
        }

        const getViewportHeight = () => {
            if (typeof window === 'undefined') return 0;
            return Math.round(window.visualViewport?.height || window.innerHeight || 0);
        };
        const getViewportWidth = () => {
            if (typeof window === 'undefined') return 0;
            return Math.round(window.visualViewport?.width || window.innerWidth || 0);
        };
        const getViewportTop = () => {
            if (typeof window === 'undefined') return 0;
            return Math.round(window.visualViewport?.offsetTop || 0);
        };
        const getLayoutViewportHeight = () => {
            if (typeof window === 'undefined') return 0;
            return Math.round(window.innerHeight || 0);
        };

        const keyboardViewportHeight = ref(getViewportHeight());
        const keyboardViewportWidth = ref(getViewportWidth());
        const keyboardViewportTop = ref(getViewportTop());
        const hasVisualViewport = ref(typeof window !== 'undefined' && !!window.visualViewport);
        const layoutViewportBaseline = ref(getLayoutViewportHeight());
        const isComposing = ref(false);

        const updateKeyboardViewportMetrics = () => {
            keyboardViewportHeight.value = getViewportHeight();
            keyboardViewportWidth.value = getViewportWidth();
            keyboardViewportTop.value = getViewportTop();
            hasVisualViewport.value = typeof window !== 'undefined' && !!window.visualViewport;
            layoutViewportBaseline.value = Math.max(
                Number(layoutViewportBaseline.value || 0),
                Number(getLayoutViewportHeight() || 0)
            );
        };

        const isCompactKeyboardViewport = computed(() => (
            Number(keyboardViewportWidth.value || 0) > 0 &&
            Number(keyboardViewportWidth.value || 0) < compactWidth
        ));

        const keyboardModalStyle = computed(() => {
            const rawHeight = keyboardViewportHeight.value || getViewportHeight();
            const viewportHeight = Math.max(Number(rawHeight || 0), minHeight);
            const spacing = isCompactKeyboardViewport.value ? compactSpacing : regularSpacing;
            const maxHeight = Math.max(viewportHeight - spacing, minHeight);
            return { maxHeight: `min(${maxHeight}px, ${maxHeightCss})` };
        });

        const isKeyboardActive = computed(() => {
            if (!isCompactKeyboardViewport.value) return false;
            const rawHeight = Number(keyboardViewportHeight.value || getViewportHeight() || 0);
            const layoutHeight = Math.max(
                Number(getLayoutViewportHeight() || 0),
                Number(layoutViewportBaseline.value || 0)
            );
            if (!rawHeight || !layoutHeight || layoutHeight <= rawHeight) return false;
            return (layoutHeight - rawHeight) >= keyboardActivationThreshold;
        });

        const authViewportTop = computed(() => Math.max(0, Number(keyboardViewportTop.value || getViewportTop() || 0)));
        const authViewportHeight = computed(() => Math.max(0, Number(keyboardViewportHeight.value || getViewportHeight() || 0)));
        const authViewportBottomPadding = computed(() => (
            `calc(env(safe-area-inset-bottom, 0px) + ${authBottomGap}px)`
        ));
        const keyboardInsetHeight = computed(() => {
            if (!isKeyboardActive.value) return 0;
            const rawHeight = Number(keyboardViewportHeight.value || getViewportHeight() || 0);
            const layoutHeight = Math.max(
                Number(getLayoutViewportHeight() || 0),
                Number(layoutViewportBaseline.value || 0)
            );
            return Math.max(0, layoutHeight - rawHeight - authViewportTop.value);
        });
        const isKeyboardViewportReliable = computed(() => (
            !!hasVisualViewport.value &&
            Number(authViewportHeight.value || 0) > 0 &&
            Number(keyboardViewportWidth.value || 0) > 0
        ));
        const authKeyboardMode = computed(() => {
            if (!isKeyboardActive.value) return 'idle';
            return isKeyboardViewportReliable.value ? 'fixed' : 'sticky';
        });

        const authKeyboardModalStyle = computed(() => {
            if (!isKeyboardActive.value) {
                return keyboardModalStyle.value;
            }
            const rawHeight = authViewportHeight.value || getViewportHeight();
            return {
                maxHeight: `min(calc(${rawHeight}px - ${authTopGap}px - ${authBottomGap}px - env(safe-area-inset-bottom, 0px)), ${maxHeightCss})`,
                marginTop: `${authViewportTop.value + authTopGap}px`,
                marginBottom: authViewportBottomPadding.value,
                '--keyboard-inset-height': `${keyboardInsetHeight.value}px`
            };
        });

        const handleKeyboardFieldFocus = (eventOrElement) => {
            if (!isCompactKeyboardViewport.value) return;
            const target = eventOrElement?.target || eventOrElement;
            if (!isKeyboardFocusableField(target)) return;
            scrollFieldIntoView(target, { delayMs: focusScrollDelayMs });
        };

        const handleAuthKeyboardFieldFocus = (eventOrElement) => {
            if (!isCompactKeyboardViewport.value || isComposing.value) return;
            const target = eventOrElement?.target || eventOrElement;
            if (!isKeyboardFocusableField(target)) return;
            scrollFieldIntoView(target, {
                delayMs: focusScrollDelayMs,
                repeatDelayMs: 140,
                block: 'nearest',
                ifNeeded: true,
                topInset: 16,
                bottomInset: 16,
                shouldSkip: () => isComposing.value
            });
        };

        const handleAuthCompositionStart = () => {
            isComposing.value = true;
        };

        const handleAuthCompositionEnd = (eventOrElement) => {
            isComposing.value = false;
            handleAuthKeyboardFieldFocus(eventOrElement);
        };

        const handleAuthFocusOut = () => {
            if (!isCompactKeyboardViewport.value) return;
            window.setTimeout(() => {
                if (document.activeElement && isKeyboardFocusableField(document.activeElement)) return;
                window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
            }, authFocusOutResetDelayMs);
        };

        const focusNextAuthField = (nextFieldId) => {
            if (!nextFieldId) return false;
            const target = document.getElementById(nextFieldId);
            if (typeof target?.focus !== 'function') return false;
            try {
                target.focus({ preventScroll: true });
            } catch (e) {
                target.focus();
            }
            handleAuthKeyboardFieldFocus(target);
            return true;
        };

        const submitAuthFormFromEnter = (event, options = {}) => {
            if (isComposing.value || event?.isComposing) return;
            if (event?.key && event.key !== 'Enter') return;
            const form = options.formId ? document.getElementById(options.formId) : event?.target?.form;
            if (!form) return;
            event?.preventDefault?.();
            if (options.nextFieldId && focusNextAuthField(options.nextFieldId)) return;
            if (typeof form.requestSubmit === 'function') {
                form.requestSubmit();
            } else {
                form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            }
        };

        if (typeof onMounted === 'function') {
            onMounted(() => {
                updateKeyboardViewportMetrics();
                window.addEventListener('resize', updateKeyboardViewportMetrics);
                window.visualViewport?.addEventListener('resize', updateKeyboardViewportMetrics);
                window.visualViewport?.addEventListener('scroll', updateKeyboardViewportMetrics);
            });
        }

        if (typeof onUnmounted === 'function') {
            onUnmounted(() => {
                window.removeEventListener('resize', updateKeyboardViewportMetrics);
                window.visualViewport?.removeEventListener('resize', updateKeyboardViewportMetrics);
                window.visualViewport?.removeEventListener('scroll', updateKeyboardViewportMetrics);
            });
        }

        return {
            keyboardViewportHeight,
            keyboardViewportWidth,
            keyboardViewportTop,
            keyboardInsetHeight,
            isCompactKeyboardViewport,
            isKeyboardActive,
            isComposing,
            keyboardModalStyle,
            authViewportTop,
            authViewportHeight,
            authViewportBottomPadding,
            isKeyboardViewportReliable,
            authKeyboardMode,
            authKeyboardModalStyle,
            updateKeyboardViewportMetrics,
            handleKeyboardFieldFocus,
            handleAuthKeyboardFieldFocus,
            handleAuthCompositionStart,
            handleAuthCompositionEnd,
            handleAuthFocusOut,
            focusNextAuthField,
            submitAuthFormFromEnter,
            scrollKeyboardFieldIntoView: scrollFieldIntoView
        };
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
        fieldIds.forgotPasswordEmail = fieldIds.forgotPasswordEmail || fieldIds.loginEmail;

        const loginForm = reactive({ email: '', password: '', remember: true });
        const registerForm = reactive({
            email: '',
            password: '',
            confirmPassword: '',
            displayName: '',
            remember: true
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
            const emailFieldIds = Array.from(new Set([
                fieldIds.loginEmail,
                fieldIds.forgotPasswordEmail
            ].filter(Boolean)));
            syncFormFieldsFromDom([
                ...emailFieldIds.map(elementId => ({
                    elementId,
                    form: loginForm,
                    key: 'email',
                    transform: normalizeEmail
                })),
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

        const focusAuthFieldById = (elementId, options = {}) => focusFieldById(elementId, nextTick, {
            preventScroll: true,
            scrollIntoView: true,
            block: 'nearest',
            ifNeeded: true,
            topInset: 16,
            bottomInset: 16,
            ...options
        });

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

        const clearRegisterConfirmPassword = async () => {
            clearStatus(registerStatus);
            registerForm.confirmPassword = '';
            registerErrors.confirmPassword = '';
            await focusAuthFieldById(fieldIds.registerConfirmPassword, { delayMs: 0 });
        };

        const normalizeRegisterDisplayName = () => {
            registerForm.displayName = normalizeDisplayName(registerForm.displayName);
        };

        const shouldSkipComposingInput = (event) => !!event?.isComposing;

        const handleLoginEmailInput = (event) => {
            if (shouldSkipComposingInput(event)) return;
            clearStatus(loginStatus);
            if (!loginForm.email) {
                loginErrors.email = '';
                return;
            }
            validateLoginEmail(false);
        };

        const handleLoginPasswordInput = (event) => {
            if (shouldSkipComposingInput(event)) return;
            clearStatus(loginStatus);
            if (!loginForm.password) {
                loginErrors.password = '';
                return;
            }
            validateLoginPassword(false);
        };

        const handleForgotPasswordEmailInput = (event) => {
            if (shouldSkipComposingInput(event)) return;
            clearStatus(forgotPasswordStatus);
            if (!loginForm.email) {
                forgotPasswordErrors.email = '';
                return;
            }
            validateForgotPasswordEmail(false);
        };

        const handleRegisterEmailInput = (event) => {
            if (shouldSkipComposingInput(event)) return;
            clearStatus(registerStatus);
            if (!registerForm.email) {
                registerErrors.email = '';
                return;
            }
            validateRegisterEmail(false);
        };

        const handleRegisterDisplayNameInput = (event) => {
            if (shouldSkipComposingInput(event)) return;
            clearStatus(registerStatus);
            registerForm.displayName = normalizeDisplayName(registerForm.displayName);
        };

        const handleRegisterPasswordInput = (event) => {
            if (shouldSkipComposingInput(event)) return;
            clearStatus(registerStatus);
            validateRegisterPassword(false);
            if (registerForm.confirmPassword) {
                validateRegisterConfirmPassword(false);
            } else {
                registerErrors.confirmPassword = '';
            }
        };

        const handleRegisterConfirmPasswordInput = (event) => {
            if (shouldSkipComposingInput(event)) return;
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
            clearRegisterConfirmPassword,
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
        createKeyboardViewportController,
        createAuthFormController
    };
})(window);
