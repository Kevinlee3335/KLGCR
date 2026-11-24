import type { ImapFlow } from 'imapflow';

// Billing sender addresses listed in Unifi's Home and Business billing FAQs.
export const unifiMailSenders = ['noreply@unifi.com.my','unifibill@unifi.com.my','tmbilling@tm.com.my'];

export async function unifiMailboxes(client: Pick<ImapFlow, 'list'>) {
  const folders = await client.list();
  const paths = ['INBOX', ...folders.filter(folder => !folder.flags?.has('\\Noselect') && (folder.specialUse === '\\Junk'
    || /(?:^|[/.])(?:junk(?:[ _-]?(?:e-?mail))?|spam|bulk(?:[ _-]?mail)?)(?:$|[/.])/i.test(folder.path)))
    .map(folder => folder.path)];
  return paths.filter((path, index) => paths.findIndex(other => other.toLowerCase() === path.toLowerCase()) === index);
}
