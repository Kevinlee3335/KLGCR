// @vitest-environment node
import { expect, it, vi } from 'vitest';
import type { ImapFlow } from 'imapflow';
import { unifiMailboxes } from './unifi-mailboxes';
it('checks Inbox and detected Junk / Spam folders while skipping Trash, Sent and non-selectable folders',async()=>{
  const list=vi.fn().mockResolvedValue([
    {path:'Inbox'}, {path:'Junk E-mail'}, {path:'INBOX.Spam'}, {path:'Bulk',specialUse:'\\Junk'},
    {path:'Spam',flags:new Set(['\\Noselect'])}, {path:'Trash'}, {path:'Sent'},
  ]);
  expect(await unifiMailboxes({list} as unknown as ImapFlow)).toEqual(['INBOX','Junk E-mail','INBOX.Spam','Bulk']);
});
