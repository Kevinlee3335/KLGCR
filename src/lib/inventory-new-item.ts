export type InventoryStore = "building" | "office" | "cleaner";
export type InventoryCodeItem = { item_code: string; description: string; category: string };

const buildingCategories = ["Building", "Electrical", "Painting", "Piping", "Chemical"];
const series: Record<string, { prefix: string; digits: number }> = {
  Building: { prefix: "KLGCR-B", digits: 5 },
  Electrical: { prefix: "KLGCR-E", digits: 5 },
  Painting: { prefix: "KLGCR-P", digits: 5 },
  Piping: { prefix: "KLGCR-PG", digits: 5 },
  Chemical: { prefix: "KLGCR-C", digits: 5 },
  "Office Inventory": { prefix: "OFF-", digits: 4 },
  "Cleaner Supplies": { prefix: "CLN-", digits: 4 },
};

export function inventoryCategories(store: InventoryStore) {
  return store === "office" ? ["Office Inventory"] : store === "cleaner" ? ["Cleaner Supplies"] : buildingCategories;
}

export function inventoryCodeSeries(category: string) {
  return series[category];
}

export function inventoryCodePreview(category: string, items: Pick<InventoryCodeItem, "item_code">[]) {
  const config = inventoryCodeSeries(category);
  if (!config) return null;
  let highest = 0;
  let digits = config.digits;
  let latest: string | null = null;
  for (const item of items) {
    const code = item.item_code.trim().toUpperCase();
    const canonical = /^(B|E|P|PG|C)\d+$/.test(code) ? `KLGCR-${code}` : code;
    if (!canonical.startsWith(config.prefix)) continue;
    const suffix = canonical.slice(config.prefix.length);
    if (!/^\d+$/.test(suffix)) continue;
    const value = Number(suffix);
    if (!Number.isSafeInteger(value)) continue;
    digits = Math.max(digits, suffix.length);
    if (value > highest) { highest = value; latest = item.item_code; }
  }
  return { latest, next: `${config.prefix}${String(highest + 1).padStart(digits, "0")}` };
}

function normalise(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

export function suggestInventoryCategory(description: string, store: InventoryStore, items: InventoryCodeItem[]) {
  if (store !== "building") return inventoryCategories(store)[0];
  const name = normalise(description);
  if (!name) return "";
  const exact = [...new Set(items.filter(item => normalise(item.description) === name).map(item => item.category))];
  if (exact.length === 1 && buildingCategories.includes(exact[0])) return exact[0];
  // Specific material terms win over generic words such as "joint" or "light".
  const rules: [string, RegExp][] = [
    ["Piping", /\b(PVC|UPVC|CPVC|HDPE|PPR|PIPE|PIPING|PLUMBING|ELBOW|TEE|COUPLING|VALVE|FAUCET|TAP|HOSE|BOTTLE TRAP|WATER TRAP|CISTERN|BASIN|TOILET|SHOWER)\b/],
    ["Electrical", /\b(LED|BULB|SOCKET|SWITCH|ELECTRICAL|CABLE|WIRE|MCB|RCCB|CONTACTOR|BALLAST|STARTER|LAMP|LIGHT|FAN|BATTERY)\b/],
    ["Painting", /\b(PAINT|PRIMER|THINNER|VARNISH|LACQUER|ROLLER|PAINTBRUSH|BRUSH)\b/],
    ["Chemical", /\b(CHEMICAL|DETERGENT|DISINFECTANT|BLEACH|ACID|PESTICIDE|SUMITHION|TENOPA)\b/],
    ["Building", /\b(DOOR|WINDOW|HANDLE|HINGE|LOCK|PADLOCK|SCREW|NAIL|CEMENT|CONCRETE|TILE|CEILING|PLYWOOD|SAND|BRICK)\b/],
  ];
  const matches = rules.filter(([, pattern]) => pattern.test(name));
  return matches.length === 1 ? matches[0][0] : "";
}

export function matchingInventoryItems(description: string, items: InventoryCodeItem[]) {
  const name = normalise(description);
  return name.length < 3 ? [] : items.filter(item => {
    const existing = normalise(item.description);
    return existing === name || existing.includes(name) || name.includes(existing) && existing.length >= 6;
  }).slice(0, 5);
}
