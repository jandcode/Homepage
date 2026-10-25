const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function cleanEmail(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

export function validateAcceptAgreement(body) {
  const fields = {};
  const full_name = typeof body.full_name === 'string' ? body.full_name.trim() : '';
  const company_name = typeof body.company_name === 'string' ? body.company_name.trim() : '';
  const job_title = typeof body.job_title === 'string' ? body.job_title.trim() : '';
  const agreed = body.agreed === true || body.agreed === 'true';
  if (!full_name || full_name.length > 200) fields.full_name = 'Enter your full name.';
  if (!company_name || company_name.length > 200) fields.company_name = 'Enter your company name.';
  if (!job_title || job_title.length > 200) fields.job_title = 'Enter your job title.';
  if (!agreed) fields.agreed = 'You must agree to continue.';
  return { ok: Object.keys(fields).length === 0, fields, data: { full_name, company_name, job_title } };
}

export function validateChecklistPatch(body) {
  const fields = {};
  const completed = body.completed;
  const client_note = typeof body.client_note === 'string' ? body.client_note.trim() : undefined;
  if (completed !== undefined && completed !== true && completed !== false) {
    fields.completed = 'completed must be true or false.';
  }
  if (client_note !== undefined && client_note.length > 5000) {
    fields.client_note = 'Note is too long.';
  }
  return { ok: Object.keys(fields).length === 0, fields, data: { completed, client_note } };
}
