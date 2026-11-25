// Non-mutating production probe. Workflow event/step persistence is exercised;
// real ledger rows, source files, rules, sign-off and outbound messaging are read-only.
export async function bankImportVerificationWorkflow(period: string) {
  'use workflow';
  const sources = await verifySources(period);
  const evidence = await verifyEvidence(period);
  const matching = await verifyMatching(period);
  return { status: 'completed', dryRun: true, sources, evidence, matching,
    limitations: ['Does not create or sign off receipts', 'Does not exercise provider writes', 'Evidence sample is bounded to 6 files'] };
}
async function verifySources(period: string) {
  'use step';
  const { listActiveBankImportMailboxes, listBankImportGmailMessageIds } = await import('@/lib/bank-import');
  const mailboxes = await listActiveBankImportMailboxes();
  if (!mailboxes.length) throw new Error('No active source mailbox');
  let messages = 0;
  for (const mailbox of mailboxes) messages += (await listBankImportGmailMessageIds({ mailboxId: mailbox.id, billingPeriod: period })).length;
  return { mailboxes: mailboxes.length, messages };
}
async function verifyEvidence(period: string) {
  'use step';
  const { verifyBankImportEvidence } = await import('@/lib/bank-import');
  return verifyBankImportEvidence(period);
}
async function verifyMatching(period: string) {
  'use step';
  const { autoMatchUnmatchedReferences } = await import('@/lib/monthly-payments-ops');
  return autoMatchUnmatchedReferences({ actor: 'release validation', periods: [period], dryRun: true });
}
