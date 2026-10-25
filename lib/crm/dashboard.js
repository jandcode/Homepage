import { OPEN_STAGES } from './constants.js';
import { monthWindow } from './dates.js';

function asNumber(value) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

export function sumByCurrency(rows) {
  const totals = new Map();
  for (const row of rows) {
    const currency = row.currency || 'USD';
    const current = totals.get(currency) || { currency, value: 0, count: 0 };
    current.value = asNumber(current.value + asNumber(row.value));
    current.count += 1;
    totals.set(currency, current);
  }
  return [...totals.values()];
}

function followup(deal) {
  return {
    id: deal.id,
    title: deal.title,
    stage: deal.stage,
    next_step: deal.next_step,
    next_step_date: deal.next_step_date,
    company_name: deal.company?.name || null,
    contact_name: deal.contact?.name || null,
    value: asNumber(deal.value),
    currency: deal.currency || 'USD',
  };
}

export function buildDashboard(deals, now, timeZone) {
  const { today, monthStart, nextMonthStart } = monthWindow(now, timeZone);
  const openPipelineByStage = OPEN_STAGES.map((stage) => {
    const rows = deals.filter((deal) => deal.stage === stage);
    return {
      stage,
      count: rows.length,
      totals: sumByCurrency(rows),
    };
  });
  const openRows = deals.filter((deal) => OPEN_STAGES.includes(deal.stage));
  const withDate = openRows.filter((deal) => deal.next_step_date);
  const won = deals.filter((deal) => {
    if (deal.stage !== 'won' || !deal.won_at) return false;
    const when = new Date(deal.won_at);
    return when >= monthStart && when < nextMonthStart;
  });
  return {
    timezone: timeZone,
    today,
    open_pipeline: sumByCurrency(openRows),
    open_pipeline_by_stage: openPipelineByStage,
    followups_due_today: withDate
      .filter((deal) => deal.next_step_date === today)
      .map(followup),
    followups_overdue: withDate
      .filter((deal) => deal.next_step_date < today)
      .sort((a, b) => a.next_step_date.localeCompare(b.next_step_date))
      .map(followup),
    won_this_month: sumByCurrency(won),
    won_this_month_count: won.length,
  };
}
