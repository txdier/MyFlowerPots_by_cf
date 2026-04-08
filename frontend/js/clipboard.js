(function (global) {
    let copyPromptElements = null;

    function isIOSWebKit() {
        const ua = global.navigator?.userAgent || '';
        return /iPad|iPhone|iPod/i.test(ua);
    }

    function restoreSelection(selection, range) {
        if (!selection) return;
        selection.removeAllRanges();
        if (range) {
            selection.addRange(range);
        }
    }

    function restoreFocus(activeElement) {
        if (!activeElement || typeof activeElement.focus !== 'function') return;
        try {
            activeElement.focus({ preventScroll: true });
        } catch (error) {
            activeElement.focus();
        }
    }

    function executeCopyCommand() {
        try {
            return document.execCommand('copy');
        } catch (error) {
            console.warn('execCommand copy failed:', error);
            return false;
        }
    }

    function createHiddenTextarea(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.setAttribute('aria-hidden', 'true');
        textarea.setAttribute('tabindex', '-1');
        textarea.style.position = 'fixed';
        textarea.style.top = '16px';
        textarea.style.left = '16px';
        textarea.style.width = '1px';
        textarea.style.height = '1px';
        textarea.style.padding = '0';
        textarea.style.border = '0';
        textarea.style.outline = '0';
        textarea.style.boxShadow = 'none';
        textarea.style.background = 'transparent';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        textarea.style.zIndex = '-1';
        textarea.style.fontSize = '16px';
        textarea.style.contain = 'strict';
        return textarea;
    }

    function createHiddenEditable(text) {
        const editable = document.createElement('div');
        editable.textContent = text;
        editable.contentEditable = 'true';
        editable.setAttribute('aria-hidden', 'true');
        editable.style.position = 'fixed';
        editable.style.top = '16px';
        editable.style.left = '16px';
        editable.style.width = '1px';
        editable.style.height = '1px';
        editable.style.padding = '0';
        editable.style.border = '0';
        editable.style.outline = '0';
        editable.style.opacity = '0';
        editable.style.pointerEvents = 'none';
        editable.style.zIndex = '-1';
        editable.style.whiteSpace = 'pre-wrap';
        editable.style.userSelect = 'text';
        editable.style.webkitUserSelect = 'text';
        editable.style.fontSize = '16px';
        return editable;
    }

    function selectTextareaContents(textarea) {
        try {
            textarea.focus({ preventScroll: true });
        } catch (error) {
            textarea.focus();
        }

        if (isIOSWebKit()) {
            const previousContentEditable = textarea.contentEditable;
            const previousReadOnly = textarea.readOnly;
            textarea.contentEditable = 'true';
            textarea.readOnly = false;

            const range = document.createRange();
            range.selectNodeContents(textarea);

            const selection = document.getSelection ? document.getSelection() : null;
            if (selection) {
                selection.removeAllRanges();
                selection.addRange(range);
            }

            textarea.setSelectionRange(0, textarea.value.length);
            textarea.contentEditable = previousContentEditable;
            textarea.readOnly = previousReadOnly;
            return;
        }

        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
    }

    function selectEditableContents(editable) {
        try {
            editable.focus({ preventScroll: true });
        } catch (error) {
            editable.focus();
        }

        const selection = document.getSelection ? document.getSelection() : null;
        if (!selection) return;

        const range = document.createRange();
        range.selectNodeContents(editable);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    function withTemporaryNode(node, selectContents) {
        if (!document?.body) return false;

        const selection = document.getSelection ? document.getSelection() : null;
        const originalRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        const activeElement = document.activeElement;

        document.body.appendChild(node);

        let copied = false;
        try {
            selectContents(node);
            copied = executeCopyCommand();
        } finally {
            document.body.removeChild(node);
            restoreSelection(selection, originalRange);
            restoreFocus(activeElement);
        }

        return copied;
    }

    function fallbackCopyUsingClipboardData(text) {
        const clipboardData = global.clipboardData;
        if (!clipboardData?.setData) return false;
        try {
            clipboardData.setData('Text', text);
            return true;
        } catch (error) {
            console.warn('window.clipboardData copy failed:', error);
            return false;
        }
    }

    function fallbackCopyUsingCopyEvent(text) {
        if (typeof document?.execCommand !== 'function') return false;

        let copied = false;
        const handler = function (event) {
            const clipboardData = event.clipboardData || global.clipboardData;
            if (!clipboardData?.setData) return;

            clipboardData.setData('text/plain', text);
            event.preventDefault();
            copied = true;
        };

        document.addEventListener('copy', handler, true);
        try {
            copied = executeCopyCommand() || copied;
        } finally {
            document.removeEventListener('copy', handler, true);
        }

        return copied;
    }

    function fallbackCopyText(text) {
        if (fallbackCopyUsingClipboardData(text)) return true;
        if (fallbackCopyUsingCopyEvent(text)) return true;
        if (withTemporaryNode(createHiddenTextarea(text), selectTextareaContents)) return true;
        return withTemporaryNode(createHiddenEditable(text), selectEditableContents);
    }

    async function copyWithClipboardItem(text) {
        if (!global.navigator?.clipboard?.write || typeof global.ClipboardItem !== 'function' || typeof Blob !== 'function') {
            return false;
        }

        try {
            const item = new global.ClipboardItem({
                'text/plain': new Blob([text], { type: 'text/plain' })
            });
            await global.navigator.clipboard.write([item]);
            return true;
        } catch (error) {
            console.warn('ClipboardItem copy failed, falling back:', error);
            return false;
        }
    }

    async function copyText(text) {
        if (typeof text !== 'string' || text.length === 0) return false;

        if (global.navigator?.clipboard?.writeText) {
            try {
                await global.navigator.clipboard.writeText(text);
                return true;
            } catch (error) {
                console.warn('Clipboard API writeText failed, trying fallbacks:', error);
            }
        }

        if (await copyWithClipboardItem(text)) {
            return true;
        }

        return fallbackCopyText(text);
    }

    function selectPromptText() {
        if (!copyPromptElements?.textarea) return;
        try {
            copyPromptElements.textarea.focus({ preventScroll: true });
        } catch (error) {
            copyPromptElements.textarea.focus();
        }
        copyPromptElements.textarea.select();
        copyPromptElements.textarea.setSelectionRange(0, copyPromptElements.textarea.value.length);
    }

    function setCopyPromptVisible(visible) {
        if (!copyPromptElements?.overlay) return;
        copyPromptElements.overlay.style.display = visible ? 'flex' : 'none';
        copyPromptElements.overlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }

    function ensureCopyPrompt() {
        if (copyPromptElements || !document?.body) return copyPromptElements;

        const overlay = document.createElement('div');
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-hidden', 'true');
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.display = 'none';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.padding = '24px';
        overlay.style.background = 'rgba(15, 23, 42, 0.65)';
        overlay.style.backdropFilter = 'blur(10px)';
        overlay.style.zIndex = '9999';

        const panel = document.createElement('div');
        panel.style.width = '100%';
        panel.style.maxWidth = '560px';
        panel.style.background = '#ffffff';
        panel.style.borderRadius = '24px';
        panel.style.padding = '24px';
        panel.style.boxShadow = '0 24px 80px rgba(15, 23, 42, 0.22)';

        const title = document.createElement('div');
        title.textContent = '复制链接';
        title.style.fontSize = '20px';
        title.style.fontWeight = '800';
        title.style.color = '#111827';

        const message = document.createElement('p');
        message.style.margin = '12px 0 0';
        message.style.fontSize = '14px';
        message.style.lineHeight = '1.7';
        message.style.color = '#4b5563';

        const hint = document.createElement('p');
        hint.textContent = '系统已自动尝试多种复制方式；如果仍未成功，可点“再次复制”，最后再长按下方内容。';
        hint.style.margin = '10px 0 0';
        hint.style.fontSize = '12px';
        hint.style.lineHeight = '1.6';
        hint.style.color = '#6b7280';

        const textarea = document.createElement('textarea');
        textarea.setAttribute('readonly', '');
        textarea.setAttribute('spellcheck', 'false');
        textarea.style.width = '100%';
        textarea.style.minHeight = '120px';
        textarea.style.marginTop = '16px';
        textarea.style.padding = '16px';
        textarea.style.border = '1px solid #d1d5db';
        textarea.style.borderRadius = '18px';
        textarea.style.background = '#f9fafb';
        textarea.style.color = '#111827';
        textarea.style.fontSize = '14px';
        textarea.style.lineHeight = '1.7';
        textarea.style.resize = 'none';
        textarea.style.outline = 'none';
        textarea.style.boxSizing = 'border-box';

        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '12px';
        actions.style.marginTop = '16px';

        const retryButton = document.createElement('button');
        retryButton.type = 'button';
        retryButton.textContent = '再次复制';
        retryButton.style.flex = '1';
        retryButton.style.border = '0';
        retryButton.style.borderRadius = '16px';
        retryButton.style.padding = '14px 18px';
        retryButton.style.background = '#22c55e';
        retryButton.style.color = '#ffffff';
        retryButton.style.fontSize = '14px';
        retryButton.style.fontWeight = '800';
        retryButton.style.cursor = 'pointer';

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.textContent = '关闭';
        closeButton.style.flex = '1';
        closeButton.style.border = '0';
        closeButton.style.borderRadius = '16px';
        closeButton.style.padding = '14px 18px';
        closeButton.style.background = '#e5e7eb';
        closeButton.style.color = '#111827';
        closeButton.style.fontSize = '14px';
        closeButton.style.fontWeight = '700';
        closeButton.style.cursor = 'pointer';

        retryButton.addEventListener('click', async function () {
            const copied = await copyText(textarea.value);
            if (copied) {
                setCopyPromptVisible(false);
                global.alert('链接已复制到剪贴板');
                return;
            }
            selectPromptText();
        });

        closeButton.addEventListener('click', function () {
            setCopyPromptVisible(false);
        });

        overlay.addEventListener('click', function (event) {
            if (event.target === overlay) {
                setCopyPromptVisible(false);
            }
        });

        textarea.addEventListener('focus', function () {
            textarea.select();
            textarea.setSelectionRange(0, textarea.value.length);
        });

        actions.appendChild(retryButton);
        actions.appendChild(closeButton);
        panel.appendChild(title);
        panel.appendChild(message);
        panel.appendChild(hint);
        panel.appendChild(textarea);
        panel.appendChild(actions);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        copyPromptElements = {
            overlay,
            message,
            textarea
        };

        return copyPromptElements;
    }

    function showCopyPrompt(text, message) {
        const promptMessage = message || '已生成内容。系统已尝试自动复制；如果仍未成功，可继续点“再次复制”：';
        if (!document?.body) {
            if (typeof global.prompt === 'function') {
                global.prompt(promptMessage, text);
                return;
            }
            global.alert(`${promptMessage}\n${text}`);
            return;
        }

        const prompt = ensureCopyPrompt();
        prompt.message.textContent = promptMessage;
        prompt.textarea.value = text;
        setCopyPromptVisible(true);
        global.requestAnimationFrame(selectPromptText);
    }

    global.MyFlowerPotsClipboard = {
        copyText,
        showCopyPrompt
    };
})(window);
