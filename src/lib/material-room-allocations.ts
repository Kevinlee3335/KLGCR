export function parseMaterialRooms(input: string, requestedQty: number) {
  const rooms = new Map<string, number>();
  for (const token of input.trim().toUpperCase().split(/[\s,;，；]+/u).filter(Boolean)) {
    const match = /^([A-D]\d{3})(?:[=X](\d+(?:\.\d{1,2})?))?$/u.exec(token);
    if (!match) throw new Error("Enter room numbers like A110, A111 or A110=2 for two units.");
    const qty = Number(match[2] ?? 1);
    if (qty <= 0 || rooms.has(match[1])) throw new Error("Enter a positive quantity and list each room once per material.");
    rooms.set(match[1], qty);
  }

  const total = [...rooms.values()].reduce((sum, qty) => sum + Math.round(qty * 100), 0);
  if (rooms.size && total !== Math.round(requestedQty * 100)) {
    throw new Error("The quantities for the listed rooms must add up to the material quantity.");
  }
  return Array.from(rooms, ([room_no, qty]) => ({ room_no, qty }));
}
