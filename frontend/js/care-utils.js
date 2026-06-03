(function attachMyFlowerPotsCare(global) {
    const builtInCareTypes = [
        { value: 'water', label: '浇水', icon: 'fa fa-tint', color: 'bg-blue-50 text-blue-500' },
        { value: 'fertilize', label: '施肥', icon: 'fa fa-seedling', color: 'bg-green-50 text-green-500' },
        { value: 'prune', label: '修剪', icon: 'fa fa-cut', color: 'bg-orange-50 text-orange-500' },
        { value: 'repot', label: '换盆', icon: 'fa fa-exchange-alt', color: 'bg-purple-50 text-purple-500' },
        { value: 'pest', label: '病虫害', icon: 'fa fa-bug', color: 'bg-red-50 text-red-500' }
    ];

    const aliases = {
        water: ['water', 'watering', 'change_water', 'water_change', 'changewater', '换水', '浇水'],
        fertilize: ['fertilize', 'fertilizer', 'feed', '施肥'],
        prune: ['trim', 'prune', 'pruning', '修剪'],
        repot: ['repot', 're-pot', '换盆'],
        pest: ['pest', 'pests', '除虫', '病虫害']
    };

    const actionPatterns = [
        ['water', /换水|浇水|补水/],
        ['fertilize', /施肥|追肥/],
        ['prune', /修剪|打顶|摘心/],
        ['repot', /换盆|翻盆/],
        ['pest', /除虫|病虫害|杀虫/]
    ];

    const normalizeCareType = (type, action = '', options = {}) => {
        const raw = String(type || '').trim().toLowerCase();
        for (const [canonical, values] of Object.entries(aliases)) {
            if (values.includes(raw)) return canonical;
        }

        const normalizedAction = String(action || '').trim();
        for (const [canonical, pattern] of actionPatterns) {
            if (pattern.test(normalizedAction)) return canonical;
        }

        return options.keepUnknown ? (raw || 'custom') : 'custom';
    };

    const isBuiltInCareType = (type) => builtInCareTypes.some(item => item.value === normalizeCareType(type));

    const getCareTypeMeta = (type, action = '') => {
        const normalized = normalizeCareType(type, action);
        return builtInCareTypes.find(item => item.value === normalized) || {
            value: 'custom',
            label: '其他记录',
            icon: 'fa fa-clipboard-check',
            color: 'bg-gray-50 text-gray-500'
        };
    };

    const getCareTypeIcon = (type, action = '') => getCareTypeMeta(type, action).icon;

    const getCareTypeColor = (type, action = '') => getCareTypeMeta(type, action).color;

    const getCareTypeLabel = (type, action = '', options = {}) => {
        const meta = getCareTypeMeta(type, action);
        const actionLabel = String(action || '').trim();
        if (actionLabel && (!isBuiltInCareType(type) || actionLabel !== meta.label)) {
            return actionLabel;
        }
        const rawType = String(type || '').trim();
        if (meta.value === 'custom' && rawType && !['custom', 'other'].includes(rawType.toLowerCase())) {
            return rawType;
        }
        return meta.label || actionLabel || String(type || '').trim() || options.fallback || '其他记录';
    };

    const buildDynamicCareTypeOptions = ({
        schedules = [],
        records = [],
        recentRecordLimit = 5
    } = {}) => {
        const builtInLabels = new Set(builtInCareTypes.map(item => item.label));
        const options = [];
        const seenLabels = new Set();

        const addOption = (label) => {
            const normalizedLabel = String(label || '').trim();
            if (!normalizedLabel || normalizedLabel === '其他' || builtInLabels.has(normalizedLabel) || seenLabels.has(normalizedLabel)) {
                return;
            }
            seenLabels.add(normalizedLabel);
            options.push({
                value: normalizedLabel,
                label: normalizedLabel,
                icon: 'fa fa-clipboard-check',
                dynamic: true
            });
        };

        schedules.forEach((schedule) => {
            const rawType = normalizeCareType(schedule?.care_type, '', { keepUnknown: true });
            if (rawType && rawType !== 'other' && builtInCareTypes.some(item => item.value === rawType)) {
                return;
            }
            addOption(schedule?.custom_action || schedule?.care_type);
        });

        let recordOptionCount = 0;
        records.forEach((record) => {
            if (recordOptionCount >= recentRecordLimit) return;
            if (String(record?.type || '').trim().toLowerCase() !== 'other') return;

            const beforeCount = options.length;
            addOption(record?.action);
            if (options.length > beforeCount) {
                recordOptionCount += 1;
            }
        });

        return options;
    };

    global.MyFlowerPotsCare = {
        builtInCareTypes,
        normalizeCareType,
        isBuiltInCareType,
        getCareTypeMeta,
        getCareTypeIcon,
        getCareTypeColor,
        getCareTypeLabel,
        buildDynamicCareTypeOptions
    };
})(window);
