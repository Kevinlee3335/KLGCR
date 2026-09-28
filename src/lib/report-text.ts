/** Decode the legacy SQL report's escaped newlines without altering its stored data. */
export function reportText(value: string) {
  return value.replace(/\\r\\n/g,"\n").replace(/\\n/g,"\n").replace(/\r\n/g,"\n");
}
