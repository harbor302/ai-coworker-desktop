export type NaturalScheduleRepeatUnit = 'minute' | 'hour' | 'day';
export type NaturalScheduleWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface NaturalDailyScheduleConfig {
  kind: 'daily';
  times: string[];
}

export interface NaturalWeeklyScheduleConfig {
  kind: 'weekly';
  weekdays: NaturalScheduleWeekday[];
  times: string[];
}

export type NaturalScheduleConfig = NaturalDailyScheduleConfig | NaturalWeeklyScheduleConfig;

export type NaturalScheduleMode = 'once' | 'daily' | 'weekly' | 'interval';

export type ParsedNaturalScheduleResult =
  | {
      ok: true;
      sourceText: string;
      mode: NaturalScheduleMode;
      runAt: number;
      nextRunAt: number;
      scheduleConfig: NaturalScheduleConfig | null;
      repeatEvery: number | null;
      repeatUnit: NaturalScheduleRepeatUnit | null;
      readableSummary: string;
      warnings: string[];
    }
  | {
      ok: false;
      sourceText: string;
      reason: string;
      examples: string[];
    };

export interface ParseNaturalScheduleOptions {
  now?: number;
}

const EXAMPLES = ['明天早上 9 点', '每天 9 点', '每周一上午 10 点', '工作日 8:30'];
const WEEKDAY_LABELS: Record<NaturalScheduleWeekday, string> = {
  0: '周日',
  1: '周一',
  2: '周二',
  3: '周三',
  4: '周四',
  5: '周五',
  6: '周六',
};

const WEEKDAY_CHARS: Record<string, NaturalScheduleWeekday> = {
  日: 0,
  天: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
};

export function parseNaturalScheduleText(
  input: string,
  options: ParseNaturalScheduleOptions = {}
): ParsedNaturalScheduleResult {
  const sourceText = input.trim();
  const normalized = normalizeText(sourceText);
  const now = options.now ?? Date.now();

  if (!normalized) {
    return fail(sourceText, '请输入执行时间，例如“每天早上 9 点”。');
  }

  const interval = parseInterval(normalized);
  if (interval) {
    const nextRunAt = now + interval.ms;
    return {
      ok: true,
      sourceText,
      mode: 'interval',
      runAt: nextRunAt,
      nextRunAt,
      scheduleConfig: null,
      repeatEvery: interval.count,
      repeatUnit: interval.unit,
      readableSummary: `每 ${interval.count} ${unitLabel(interval.unit)}执行`,
      warnings: [],
    };
  }

  const time = parseTimeOfDay(normalized);
  if (!time) {
    return fail(sourceText, '暂时没理解执行时间，请包含明确时间点。');
  }
  const timeValue = `${pad(time.hour)}:${pad(time.minute)}`;

  if (isDaily(normalized)) {
    const scheduleConfig: NaturalDailyScheduleConfig = { kind: 'daily', times: [timeValue] };
    const nextRunAt = computeNextRunFromSchedule(scheduleConfig, now);
    return {
      ok: true,
      sourceText,
      mode: 'daily',
      runAt: nextRunAt,
      nextRunAt,
      scheduleConfig,
      repeatEvery: null,
      repeatUnit: null,
      readableSummary: `每天 ${timeValue} 执行`,
      warnings: [],
    };
  }

  const weekly = parseWeekly(normalized);
  if (weekly.length > 0) {
    const scheduleConfig: NaturalWeeklyScheduleConfig = {
      kind: 'weekly',
      weekdays: weekly,
      times: [timeValue],
    };
    const nextRunAt = computeNextRunFromSchedule(scheduleConfig, now);
    return {
      ok: true,
      sourceText,
      mode: 'weekly',
      runAt: nextRunAt,
      nextRunAt,
      scheduleConfig,
      repeatEvery: null,
      repeatUnit: null,
      readableSummary: `每周${weekly.map((day) => WEEKDAY_LABELS[day].replace(/^周/, '')).join('、')} ${timeValue} 执行`,
      warnings: [],
    };
  }

  const runAt = parseOneTimeRunAt(normalized, time, now);
  if (runAt === null) {
    return fail(sourceText, '暂时没理解日期，请试试“明天早上 9 点”或“6月20日 14:30”。');
  }
  if (runAt <= now) {
    return fail(sourceText, '这个时间已经过去了，请换成未来时间。');
  }

  return {
    ok: true,
    sourceText,
    mode: 'once',
    runAt,
    nextRunAt: runAt,
    scheduleConfig: null,
    repeatEvery: null,
    repeatUnit: null,
    readableSummary: `单次执行：${formatReadableDateTime(runAt)}`,
    warnings: [],
  };
}

export function describeScheduleTextFromConfig(input: {
  runAt: number;
  scheduleConfig: NaturalScheduleConfig | null;
  repeatEvery: number | null;
  repeatUnit: NaturalScheduleRepeatUnit | null;
}): string {
  if (input.scheduleConfig?.kind === 'daily') {
    return `每天 ${input.scheduleConfig.times.join('、')}`;
  }
  if (input.scheduleConfig?.kind === 'weekly') {
    const weekdays = input.scheduleConfig.weekdays
      .map((weekday) => WEEKDAY_LABELS[weekday])
      .join('、');
    return `每周 ${weekdays} ${input.scheduleConfig.times.join('、')}`;
  }
  if (input.repeatEvery && input.repeatUnit) {
    return `每 ${input.repeatEvery} ${unitLabel(input.repeatUnit)}`;
  }
  return formatReadableDateTime(input.runAt);
}

function fail(sourceText: string, reason: string): ParsedNaturalScheduleResult {
  return { ok: false, sourceText, reason, examples: EXAMPLES };
}

function normalizeText(value: string): string {
  return value
    .replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10))
    .replace(/：/g, ':')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function parseInterval(
  text: string
): { count: number; unit: NaturalScheduleRepeatUnit; ms: number } | null {
  const match = text.match(/(?:每隔(\d+)?|每(\d+))(分钟|分|小时|个?钟头|天|日)/);
  if (!match) return null;
  const count = Math.max(1, Number(match[1] || match[2] || 1));
  const unitText = match[3];
  if (unitText.includes('分')) {
    return { count, unit: 'minute', ms: count * 60_000 };
  }
  if (unitText.includes('小时') || unitText.includes('钟头')) {
    return { count, unit: 'hour', ms: count * 3_600_000 };
  }
  return { count, unit: 'day', ms: count * 86_400_000 };
}

function parseTimeOfDay(text: string): { hour: number; minute: number } | null {
  const hhmm = text.match(/(?:^|[^\d])(\d{1,2}):(\d{1,2})(?:$|[^\d])/);
  if (hhmm) {
    return normalizeHourMinute(Number(hhmm[1]), Number(hhmm[2]), text);
  }

  const hourMinute = text.match(/(\d{1,2})点(?:(半)|(\d{1,2})分?)?/);
  if (hourMinute) {
    const minute = hourMinute[2] ? 30 : Number(hourMinute[3] || 0);
    return normalizeHourMinute(Number(hourMinute[1]), minute, text);
  }

  if (text.includes('中午')) {
    return { hour: 12, minute: 0 };
  }

  return null;
}

function normalizeHourMinute(
  rawHour: number,
  minute: number,
  text: string
): { hour: number; minute: number } | null {
  if (!Number.isFinite(rawHour) || !Number.isFinite(minute)) return null;
  if (rawHour < 0 || rawHour > 23 || minute < 0 || minute > 59) return null;

  let hour = rawHour;
  const isAfternoon = /(下午|晚上|今晚|傍晚|夜里)/.test(text);
  const isMorning = /(上午|早上|早晨|凌晨)/.test(text);
  if (isAfternoon && hour < 12) {
    hour += 12;
  }
  if (isMorning && hour === 12) {
    hour = 0;
  }
  return { hour, minute };
}

function isDaily(text: string): boolean {
  return /(每天|每日|天天)/.test(text);
}

function parseWeekly(text: string): NaturalScheduleWeekday[] {
  if (/(工作日|每个工作日|周一到周五|周一至周五|星期一到星期五|星期一至星期五)/.test(text)) {
    return [1, 2, 3, 4, 5];
  }

  const compact = text.match(/每(?:周|星期|礼拜)([周星期礼拜一二三四五六日天、,，和]+)/);
  if (!compact) return [];

  const values: NaturalScheduleWeekday[] = [];
  for (const char of compact[1]) {
    const weekday = WEEKDAY_CHARS[char];
    if (weekday !== undefined && !values.includes(weekday)) {
      values.push(weekday);
    }
  }
  return values;
}

function parseOneTimeRunAt(
  text: string,
  time: { hour: number; minute: number },
  now: number
): number | null {
  const base = new Date(now);
  const relativeDayOffset = getRelativeDayOffset(text);
  if (relativeDayOffset !== null) {
    return createTimestamp(
      base.getFullYear(),
      base.getMonth(),
      base.getDate() + relativeDayOffset,
      time
    );
  }

  const nextWeekday = text.match(/下周([一二三四五六日天])/);
  if (nextWeekday) {
    const weekday = WEEKDAY_CHARS[nextWeekday[1]];
    const daysUntilNextWeekday = ((weekday - base.getDay() + 7) % 7) + 7;
    return createTimestamp(
      base.getFullYear(),
      base.getMonth(),
      base.getDate() + daysUntilNextWeekday,
      time
    );
  }

  const currentWeekday = text.match(/(?:本周|这周|周|星期|礼拜)([一二三四五六日天])/);
  if (currentWeekday) {
    const weekday = WEEKDAY_CHARS[currentWeekday[1]];
    let offset = (weekday - base.getDay() + 7) % 7;
    if (
      offset === 0 &&
      createTimestamp(base.getFullYear(), base.getMonth(), base.getDate(), time) <= now
    ) {
      offset = 7;
    }
    return createTimestamp(base.getFullYear(), base.getMonth(), base.getDate() + offset, time);
  }

  const fullDate = text.match(/(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})日?/);
  if (fullDate) {
    return createTimestamp(Number(fullDate[1]), Number(fullDate[2]) - 1, Number(fullDate[3]), time);
  }

  const monthDay = text.match(/(\d{1,2})月(\d{1,2})日?/);
  if (monthDay) {
    let year = base.getFullYear();
    let timestamp = createTimestamp(year, Number(monthDay[1]) - 1, Number(monthDay[2]), time);
    if (timestamp <= now) {
      year += 1;
      timestamp = createTimestamp(year, Number(monthDay[1]) - 1, Number(monthDay[2]), time);
    }
    return timestamp;
  }

  const slashDate = text.match(/(\d{1,2})\/(\d{1,2})/);
  if (slashDate) {
    let year = base.getFullYear();
    let timestamp = createTimestamp(year, Number(slashDate[1]) - 1, Number(slashDate[2]), time);
    if (timestamp <= now) {
      year += 1;
      timestamp = createTimestamp(year, Number(slashDate[1]) - 1, Number(slashDate[2]), time);
    }
    return timestamp;
  }

  if (/(早上|上午|中午|下午|晚上|今晚|凌晨|\d{1,2}[:点])/.test(text)) {
    return createTimestamp(base.getFullYear(), base.getMonth(), base.getDate(), time);
  }

  return null;
}

function getRelativeDayOffset(text: string): number | null {
  if (text.includes('后天')) return 2;
  if (text.includes('明天') || text.includes('明早') || text.includes('明晚')) return 1;
  if (text.includes('今天') || text.includes('今晚') || text.includes('今早')) return 0;
  return null;
}

function computeNextRunFromSchedule(scheduleConfig: NaturalScheduleConfig, now: number): number {
  const allowedWeekdays =
    scheduleConfig.kind === 'weekly' ? new Set(scheduleConfig.weekdays) : null;
  const base = new Date(now);

  for (let dayOffset = 0; dayOffset < 370; dayOffset += 1) {
    const candidateDay = new Date(base);
    candidateDay.setDate(base.getDate() + dayOffset);
    const weekday = candidateDay.getDay() as NaturalScheduleWeekday;
    if (allowedWeekdays && !allowedWeekdays.has(weekday)) {
      continue;
    }

    for (const time of [...scheduleConfig.times].sort()) {
      const [hour, minute] = time.split(':').map(Number);
      const timestamp = createTimestamp(
        candidateDay.getFullYear(),
        candidateDay.getMonth(),
        candidateDay.getDate(),
        { hour, minute }
      );
      if (timestamp > now) {
        return timestamp;
      }
    }
  }

  return now;
}

function createTimestamp(
  year: number,
  month: number,
  day: number,
  time: { hour: number; minute: number }
): number {
  return new Date(year, month, day, time.hour, time.minute, 0, 0).getTime();
}

function formatReadableDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function unitLabel(unit: NaturalScheduleRepeatUnit): string {
  if (unit === 'minute') return '分钟';
  if (unit === 'hour') return '小时';
  return '天';
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
