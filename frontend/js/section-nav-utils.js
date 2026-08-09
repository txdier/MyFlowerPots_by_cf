(function exposeSectionNavigation(global) {
  'use strict';

  function getActiveSectionKey({
    sections = [],
    activationY = 0,
    viewportBottom,
    documentHeight,
    bottomThreshold = 2,
  } = {}) {
    const validSections = sections
      .filter((section) => section && String(section.key || '').trim() && Number.isFinite(section.top))
      .map((section) => ({ key: String(section.key).trim(), top: section.top }))
      .sort((left, right) => left.top - right.top);

    if (validSections.length === 0) return null;

    const safeBottomThreshold = Number.isFinite(bottomThreshold)
      ? Math.max(0, bottomThreshold)
      : 2;
    const isAtDocumentBottom = Number.isFinite(viewportBottom)
      && Number.isFinite(documentHeight)
      && viewportBottom >= documentHeight - safeBottomThreshold;

    if (isAtDocumentBottom) {
      return validSections[validSections.length - 1].key;
    }

    const safeActivationY = Number.isFinite(activationY) ? activationY : 0;
    let activeKey = validSections[0].key;

    for (const section of validSections) {
      if (section.top > safeActivationY) break;
      activeKey = section.key;
    }

    return activeKey;
  }

  global.MyFlowerPotsSectionNav = Object.freeze({
    getActiveSectionKey,
  });
})(window);
