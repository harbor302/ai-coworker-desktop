import { describe, expect, it } from 'vitest';
import { parseNaturalScheduleText } from '../src/shared/schedule/natural-language-parser';

const NOW = new Date(2026, 5, 15, 11, 30, 0, 0).getTime(); // 2026-06-15 Mon 11:30

describe('parseNaturalScheduleText', () => {
  it('parses a one-time relative schedule', () => {
    const result = parseNaturalScheduleText('明天早上 9 点', { now: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe('once');
    expect(new Date(result.nextRunAt).toLocaleString('sv-SE')).toContain('2026-06-16 09:00');
    expect(result.scheduleConfig).toBeNull();
  });

  it('rejects a past one-time schedule instead of silently moving it', () => {
    const result = parseNaturalScheduleText('今天早上 9 点', { now: NOW });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('已经过去');
  });

  it('parses daily schedules', () => {
    const result = parseNaturalScheduleText('每天早上 9 点', { now: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe('daily');
    expect(result.scheduleConfig).toEqual({ kind: 'daily', times: ['09:00'] });
    expect(new Date(result.nextRunAt).toLocaleString('sv-SE')).toContain('2026-06-16 09:00');
  });

  it('parses weekly compact weekday schedules', () => {
    const result = parseNaturalScheduleText('每周一三五 9:30', { now: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe('weekly');
    expect(result.scheduleConfig).toEqual({
      kind: 'weekly',
      weekdays: [1, 3, 5],
      times: ['09:30'],
    });
    expect(new Date(result.nextRunAt).toLocaleString('sv-SE')).toContain('2026-06-17 09:30');
  });

  it('parses next-week weekday text as a one-time schedule', () => {
    const result = parseNaturalScheduleText('下周一 10 点', { now: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe('once');
    expect(new Date(result.nextRunAt).toLocaleString('sv-SE')).toContain('2026-06-22 10:00');
  });

  it('parses workday schedules', () => {
    const result = parseNaturalScheduleText('工作日 8:30', { now: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe('weekly');
    expect(result.scheduleConfig).toEqual({
      kind: 'weekly',
      weekdays: [1, 2, 3, 4, 5],
      times: ['08:30'],
    });
  });

  it('parses interval schedules', () => {
    const result = parseNaturalScheduleText('每隔 30 分钟', { now: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe('interval');
    expect(result.repeatEvery).toBe(30);
    expect(result.repeatUnit).toBe('minute');
    expect(result.scheduleConfig).toBeNull();
  });
});
