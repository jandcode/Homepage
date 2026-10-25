import { TIMELINE_STEPS } from './constants.js';

function paymentDone(project) {
  return project.payment_status === 'paid' || project.payment_status === 'waived';
}

function accessDone(project, checklist) {
  const items = checklist || [];
  if (!items.length) return false;
  return items.every((item) => Boolean(item.completed_at));
}

function agreementDone(acceptance) {
  return Boolean(acceptance);
}

function kickoffDone(project) {
  return Boolean(project.kickoff_at);
}

function inProgressDone(project) {
  return project.work_phase === 'in_progress'
    || project.work_phase === 'delivered'
    || project.work_phase === 'retainer_active';
}

function deliveredDone(project) {
  return project.work_phase === 'delivered' || project.work_phase === 'retainer_active';
}

function retainerDone(project) {
  return project.work_phase === 'retainer_active';
}

const CHECKS = {
  agreement: (ctx) => agreementDone(ctx.acceptance),
  payment: (ctx) => paymentDone(ctx.project),
  access: (ctx) => accessDone(ctx.project, ctx.checklist),
  kickoff: (ctx) => kickoffDone(ctx.project),
  in_progress: (ctx) => inProgressDone(ctx.project),
  delivered: (ctx) => deliveredDone(ctx.project),
  retainer: (ctx) => retainerDone(ctx.project),
};

export function buildTimeline(ctx) {
  const steps = TIMELINE_STEPS.map((step) => {
    const done = CHECKS[step.id](ctx);
    return { ...step, done };
  });
  let currentIndex = steps.findIndex((step) => !step.done);
  if (currentIndex === -1) currentIndex = steps.length - 1;
  return steps.map((step, index) => ({
    ...step,
    status: step.done ? 'done' : index === currentIndex ? 'current' : 'upcoming',
  }));
}

export function stuckSummary(ctx) {
  const timeline = buildTimeline(ctx);
  const current = timeline.find((step) => step.status === 'current');
  return current ? current.label : 'Complete';
}
