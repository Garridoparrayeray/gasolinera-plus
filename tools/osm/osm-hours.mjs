const OSM_DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const RAW_DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const TIME = /^([01]?\d|2[0-4]):([0-5]\d)$/;

function parseDays(text) {
    const days = new Set();
    for (const part of text.split(',')) {
        const piece = part.trim();
        const range = /^(Mo|Tu|We|Th|Fr|Sa|Su)(-(Mo|Tu|We|Th|Fr|Sa|Su))?$/.exec(piece);
        if (!range) {
            return null;
        }
        const from = OSM_DAYS.indexOf(range[1]);
        let to = from;
        if (range[3]) {
            to = OSM_DAYS.indexOf(range[3]);
        }
        let day = from;
        for (let steps = 0; steps < 8; steps++) {
            days.add(day);
            if (day === to) {
                break;
            }
            day = (day + 1) % 7;
        }
    }
    return days;
}

function pad(value) {
    return String(value).padStart(2, '0');
}

function parseRanges(text) {
    const ranges = [];
    for (const part of text.split(',')) {
        const match = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(part.trim());
        if (!match || !TIME.test(match[1]) || !TIME.test(match[2])) {
            return null;
        }
        const [fromHour, fromMinute] = match[1].split(':');
        const [toHour, toMinute] = match[2].split(':');
        let end = `${pad(toHour)}:${toMinute}`;
        if (end === '24:00' || end === '00:00') {
            end = '23:59';
        }
        const start = `${pad(fromHour)}:${fromMinute}`;
        if (start === end) {
            return null;
        }
        ranges.push(`${start}-${end}`);
    }
    return ranges;
}

function splitRule(rule) {
    let cut = rule.length;
    for (const marker of [/[0-9]/, /off/, /closed/]) {
        const at = rule.search(marker);
        if (at !== -1 && at < cut) {
            cut = at;
        }
    }
    return [rule.slice(0, cut).trim(), rule.slice(cut).trim()];
}

export function osmToRaw(value) {
    const text = String(value || '').trim();
    if (text === '' || text.length > 160) {
        return '';
    }
    if (text === '24/7') {
        return 'L-D: 24H';
    }
    const perDay = new Array(7).fill(null);
    for (const rawRule of text.split(';')) {
        let rule = rawRule.trim();
        if (rule === '') {
            continue;
        }
        rule = rule.replace(/^PH\s*,\s*/, '').replace(/\s*,\s*PH(?=\s)/, '');
        if (/^(PH|SH)\b/.test(rule)) {
            continue;
        }
        const [daysText, times] = splitRule(rule);
        let days = new Set([0, 1, 2, 3, 4, 5, 6]);
        if (daysText !== '') {
            days = parseDays(daysText);
            if (days === null) {
                return '';
            }
        }
        let ranges = null;
        if (times === 'off' || times === 'closed') {
            ranges = [];
        } else if (times === '24/7' || times === '00:00-24:00') {
            ranges = ['00:00-23:59'];
        } else {
            ranges = parseRanges(times);
        }
        if (ranges === null) {
            return '';
        }
        for (const day of days) {
            perDay[day] = ranges;
        }
    }
    const known = perDay.filter((ranges) => ranges !== null && ranges.length > 0);
    if (known.length === 0) {
        return '';
    }
    const blocks = [];
    let day = 0;
    while (day < 7) {
        const ranges = perDay[day];
        if (ranges === null || ranges.length === 0) {
            day++;
            continue;
        }
        const label = ranges.join(' Y ');
        let last = day;
        while (last + 1 < 7 && perDay[last + 1] !== null && perDay[last + 1].join(' Y ') === label) {
            last++;
        }
        let name = RAW_DAYS[day];
        if (last > day) {
            name = `${RAW_DAYS[day]}-${RAW_DAYS[last]}`;
        }
        blocks.push(`${name}: ${label}`);
        day = last + 1;
    }
    if (blocks.length === 1 && blocks[0] === 'L-D: 00:00-23:59') {
        return 'L-D: 24H';
    }
    return blocks.join('; ');
}
