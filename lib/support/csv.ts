/** CSV for the staff export. A leading BOM makes Excel read UTF-8 correctly; cells starting with = + - @ are neutralised against formula injection. */
export const csvCell = (v: unknown): string => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(cols: string[], rows: Array<Record<string, unknown>>): string {
  return "﻿" + [cols.join(",")].concat(rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))).join("\r\n");
}
