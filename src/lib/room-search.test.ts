import { describe, expect, it } from "vitest";
import { parseRoomSearch, roomSearchFilter } from "./room-search";
describe("room code search", () => {
  it.each([["a421","A","421"],["b511","B","511"],["c418","C","418"],["d726","D","726"],[" A-421 ","A","421"],["a 421","A","421"]])("recognizes %s", (input, blockCode, roomNumber) => {
    expect(parseRoomSearch(input)).toEqual({ blockCode, roomNumber });
  });
  it.each(["421", "window", "KLGCR-JOB-2026-0421", "A421,other", "XA3", ""])("preserves general search for %s", input => {
    expect(parseRoomSearch(input)).toBeNull();
  });
  it("matches historical room formats and beds without matching another room", () => {
    const filter = roomSearchFilter(parseRoomSearch("a421")!);
    expect(filter).toContain('room_no.ilike."421"');
    expect(filter).toContain('room_no.ilike."A421"');
    expect(filter).toContain('room_no.ilike."A-421"');
    expect(filter).toContain('room_no.ilike."A421-%"');
    expect(filter).not.toContain('%421%');
  });
});
