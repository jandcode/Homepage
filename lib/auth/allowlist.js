export async function syncAllowlist(client, emails) {
  const { error: deleteError } = await client.from('crm_admin_emails').delete().not('email', 'is', null);
  if (deleteError) throw deleteError;
  if (!emails.length) return;
  const { error } = await client.from('crm_admin_emails').insert(emails.map((email) => ({ email })));
  if (error) throw error;
}
