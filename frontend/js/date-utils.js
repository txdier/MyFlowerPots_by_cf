(function attachMyFlowerPotsDate(global) {
    const parseDate = (value) => {
        if (!value) return null;
        const date = value instanceof Date ? value : new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    };

    const parseDateTime = (value, options = {}) => {
        if (!value) return null;
        if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

        const text = String(value).trim();
        if (!text) return null;

        if (options.assumeUtc && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)) {
            const normalized = text.includes('T') ? text : text.replace(' ', 'T');
            return parseDate(`${normalized}Z`);
        }

        return parseDate(text);
    };

    const parseCalendarDay = (value) => {
        if (!value) return null;
        if (value instanceof Date) {
            if (Number.isNaN(value.getTime())) return null;
            return new Date(value.getFullYear(), value.getMonth(), value.getDate());
        }
        const text = String(value);
        const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
            return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        }
        const date = parseDate(text);
        return date ? new Date(date.getFullYear(), date.getMonth(), date.getDate()) : null;
    };

    const pad2 = (value) => String(value).padStart(2, '0');

    const formatDate = (value, style = 'iso') => {
        const date = parseDate(value);
        if (!date) return '';

        if (style === 'zh') {
            return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
        }
        if (style === 'datetime') {
            return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
        }
        return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    };

    const formatIsoDate = (value) => formatDate(value, 'iso');

    const formatZhDate = (value) => formatDate(value, 'zh');

    const formatDateTime = (value, options = {}) => {
        const fallback = options.fallback ?? '';
        if (!value) return fallback;

        const text = String(value);
        if (options.preserveDateOnly && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
            return text;
        }

        const date = parseDateTime(value, options);
        if (!date) return fallback;

        if (options.locale) {
            return date.toLocaleString(options.locale, {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        return formatDate(date, 'datetime');
    };

    const formatRelativeTime = (value, options = {}) => {
        const date = parseDateTime(value, options);
        if (!date) return options.fallback ?? '';

        const diff = (options.now || new Date()) - date;
        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
        if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;

        return date.toLocaleDateString(options.locale || 'zh-CN', {
            month: '2-digit',
            day: '2-digit'
        });
    };

    const getCareElapsedDays = (pot, fallbackEnd = new Date()) => {
        const start = parseCalendarDay(pot?.plant_date);
        if (!start) return null;
        const isArchived = String(pot?.status || 'active').toLowerCase() === 'archived';
        const end = isArchived && pot?.archived_at
            ? parseCalendarDay(pot.archived_at)
            : parseCalendarDay(fallbackEnd);
        if (!end) return null;
        return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
    };

    const formatCareElapsedDays = (pot, fallback = '无') => {
        const days = getCareElapsedDays(pot);
        return days ? `${days} 天` : fallback;
    };

    global.MyFlowerPotsDate = {
        parseDate,
        parseDateTime,
        parseCalendarDay,
        formatDate,
        formatIsoDate,
        formatZhDate,
        formatDateTime,
        formatRelativeTime,
        getCareElapsedDays,
        formatCareElapsedDays
    };
})(window);
