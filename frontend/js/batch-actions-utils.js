(function attachMyFlowerPotsBatchActions(global) {
    const resolveItems = (items) => {
        if (Array.isArray(items)) return items;
        if (Array.isArray(items?.value)) return items.value;
        return [];
    };

    const requireSelected = ({ items, showAlert, emptyMessage }) => {
        const selected = resolveItems(items);
        if (selected.length === 0) {
            if (typeof showAlert === 'function') showAlert(emptyMessage);
            return null;
        }
        return selected;
    };

    const clearEditSelection = ({ pots, isEditMode, destroySortable } = {}) => {
        const potList = resolveItems(pots);
        potList.forEach(pot => {
            pot.selected = false;
        });

        if (isEditMode) {
            isEditMode.value = false;
        }
        if (typeof destroySortable === 'function') {
            destroySortable();
        }
    };

    global.MyFlowerPotsBatchActions = {
        requireSelected,
        clearEditSelection
    };
})(window);
