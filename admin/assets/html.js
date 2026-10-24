export const STAGE_ORDER = [
  'lead',
  'contacted',
  'audit_call_booked',
  'audit_paid',
  'fix_project',
  'retainer',
  'won',
  'lost',
];

export const STAGE_LABELS = {
  lead: 'Lead',
  contacted: 'Contacted',
  audit_call_booked: 'Audit call booked',
  audit_paid: 'Audit paid',
  fix_project: 'Fix project',
  retainer: 'Retainer',
  won: 'Won',
  lost: 'Lost',
};

export const ACTIVITY_LABELS = {
  note: 'Note',
  email: 'Email',
  call: 'Call',
  meeting: 'Meeting',
};

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function stageLabel(stage) {
  return STAGE_LABELS[stage] || stage || '—';
}

export function stageOptions(selected) {
  return STAGE_ORDER.map((stage) => (
    `<option value="${stage}"${stage === selected ? ' selected' : ''}>${escapeHtml(STAGE_LABELS[stage])}</option>`
  )).join('');
}

export function formatMoney(value, currency = 'USD') {
  const amount = Number(value) || 0;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function formatTotals(totals) {
  if (!totals?.length) return formatMoney(0, 'USD');
  return totals.map((total) => formatMoney(total.value, total.currency)).join(' · ');
}

export function formatDay(ymd) {
  if (!ymd) return '—';
  const [year, month, day] = ymd.split('-').map(Number);
  if (!year || !month || !day) return escapeHtml(ymd);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatWhen(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export function safeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
  } catch {
    return null;
  }
  return null;
}

export function localToday() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
