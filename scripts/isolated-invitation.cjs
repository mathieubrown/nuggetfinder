// Staff-only staging command. Admission is separate from identity and parental verification.
'use strict';
const {Client} = require(process.env.NUGGETFINDER_PG || 'pg');

async function main() {
  const uri = new URL(process.env.NUGGETFINDER_LOCAL_PG_URL || '');
  if (!['localhost','127.0.0.1','[::1]'].includes(uri.hostname) || !uri.pathname.startsWith('/nugget_test_')) {
    throw Error('A disposable nugget_test database is required');
  }
  const [operation, account] = process.argv.slice(2);
  if (!['admit','withdraw'].includes(operation) || !/^[a-f0-9-]{36}$/i.test(account || '')) {
    throw Error('Usage: isolated-invitation.cjs admit|withdraw existing-auth-account-id');
  }
  const client = new Client({connectionString:uri.href});
  await client.connect();
  try {
    const result = operation === 'admit'
      ? await client.query(`insert into public.account_invitations(account_id)
        select id from public.accounts where id=$1 and not banned
        on conflict(account_id) do update set revoked_at=null returning account_id`,[account])
      : await client.query('update public.account_invitations set revoked_at=now() where account_id=$1 returning account_id',[account]);
    if (!result.rowCount) throw Error('Eligible account or invitation unavailable');
    console.log(operation === 'admit' ? 'Invitation granted. Independent verification is separate.' : 'Invitation withdrawn.');
  } finally { await client.end(); }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
