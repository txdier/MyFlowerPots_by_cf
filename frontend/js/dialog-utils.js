(function attachMyFlowerPotsDialog(global) {
    const nativeAlert = typeof global.alert === 'function'
        ? global.alert.bind(global)
        : () => {};
    const nativeConfirm = typeof global.confirm === 'function'
        ? global.confirm.bind(global)
        : () => false;
    const nativePrompt = typeof global.prompt === 'function'
        ? global.prompt.bind(global)
        : () => null;

    const normalizeMessage = (message) => String(message ?? '');

    const alert = (message) => nativeAlert(normalizeMessage(message));

    const confirm = (message) => nativeConfirm(normalizeMessage(message));

    const prompt = (message, defaultValue = '') =>
        nativePrompt(normalizeMessage(message), String(defaultValue ?? ''));

    global.MyFlowerPotsDialog = {
        alert,
        confirm,
        prompt
    };
})(window);
