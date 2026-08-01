const FORMULA_PREFIXES = ["=", "+", "-", "@"];

export function escapeCsvField(value: string): string {
  const guarded = FORMULA_PREFIXES.some((prefix) => value.startsWith(prefix)) ? `'${value}` : value;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function createCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvField).join(",")).join("\r\n");
}
