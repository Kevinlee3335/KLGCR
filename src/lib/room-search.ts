export function parseRoomSearch(value?: string) {
  const match = value?.trim().match(/^([a-d])\s*-?\s*(\d{3,4})$/i);
  return match ? { blockCode: match[1].toUpperCase(), roomNumber: match[2] } : null;
}

// Historical records contain both bare numbers and prefixed room codes.
// Include bed suffixes, but avoid matching room 1421 when searching A421.
export function roomSearchFilter(room: { blockCode: string; roomNumber: string }) {
  const values = [room.roomNumber, `${room.blockCode}${room.roomNumber}`, `${room.blockCode}-${room.roomNumber}`, `${room.blockCode} ${room.roomNumber}`];
  return values.flatMap(value => [`room_no.ilike.${JSON.stringify(value)}`, `room_no.ilike.${JSON.stringify(`${value}-%`)}`]).join(",");
}
