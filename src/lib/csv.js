// Pembuat CSV yang aman dibuka di Excel.
// - Sel yang diawali = + - @ diberi tanda ' di depan (mencegah CSV/formula injection).
// - BOM UTF-8 agar karakter Indonesia tampil benar di Excel.
function cell(value) {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString().slice(0, 19).replace("T", " ") : String(value);
  if (/^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text))) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns, rows) {
  const header = columns.map((c) => cell(c.label)).join(",");
  const body = rows.map((row) => columns.map((c) => cell(typeof c.value === "function" ? c.value(row) : row[c.key])).join(","));
  return `﻿${[header, ...body].join("\r\n")}\r\n`;
}

export function csvResponse(filename, csv) {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
