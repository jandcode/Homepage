import { DEFAULT_TIMEZONE } from './constants.js';

export function resolveTimeZone(value) {
  const timeZone = String(value || '').trim() || DEFAULT_TIMEZONE;
  try {
    Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function timeZoneOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  let hour = Number(map.hour);
  let day = Number(map.day);
  if (hour === 24) {
    hour = 0;
    day += 1;
  }
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    day,
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - date.getTime();
}

export function zonedYmd(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function zonedDayStart(ymd, timeZone) {
  const [year, month, day] = ymd.split('-').map(Number);
  let utc = Date.UTC(year, month - 1, day, 0, 0, 0);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const next = Date.UTC(year, month - 1, day, 0, 0, 0) - timeZoneOffsetMs(new Date(utc), timeZone);
    if (Math.abs(next - utc) < 1) return new Date(next);
    utc = next;
  }
  return new Date(utc);
}

export function addMonthsYmd(ymd, count) {
  const [year, month, day] = ymd.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + count, day));
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function monthWindow(now, timeZone) {
  const today = zonedYmd(now, timeZone);
  const monthStartYmd = `${today.slice(0, 7)}-01`;
  const nextMonthYmd = addMonthsYmd(monthStartYmd, 1);
  return {
    today,
    monthStart: zonedDayStart(monthStartYmd, timeZone),
    nextMonthStart: zonedDayStart(nextMonthYmd, timeZone),
  };
}
