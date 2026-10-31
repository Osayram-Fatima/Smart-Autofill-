// shared/validation.js — safety checks, warnings, date/id normalization

(function (global) {
  // Preserve identifiers as text. Do not strip leading zeros.
  function asText(v) {
    if (v === null || v === undefined) return "";
    return String(v).trim();
  }

  function looksLikeDate(v) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ||
           /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(String(v));
  }

  // Normalize to YYYY-MM-DD for <input type=date>. If unknown format, return null.
  function toISODate(v) {
    const s = String(v).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      let [, d, mo, y] = m;
      if (y.length === 2) y = (parseInt(y, 10) > 30 ? "19" : "20") + y;
      const dd = d.padStart(2, "0"), mm = mo.padStart(2, "0");
      const dt = new Date(`${y}-${mm}-${dd}T00:00:00`);
      if (!isNaN(dt.getTime())) return `${y}-${mm}-${dd}`;
    }
    return null;
  }

  // Return array of {level, code, message}
  function validateRow(row, headers) {
    const warnings = [];
    if (!row) return [{ level: "error", code: "EMPTY_ROW", message: "Row is empty." }];

    // Duplicate-ish: all same as neighbor? left to caller.
    const emptyCount = headers.filter((h) => !asText(row[h])).length;
    if (emptyCount === headers.length) {
      warnings.push({ level: "error", code: "ALL_EMPTY", message: "All columns empty for this row." });
    } else if (emptyCount > 0) {
      warnings.push({
        level: "warn",
        code: "PARTIAL_EMPTY",
        message: `${emptyCount} field(s) are empty. Fill carefully.`
      });
    }

    // Date-like columns check
    for (const h of headers) {
      if (/date|dob|birth/i.test(h) && row[h]) {
        if (!toISODate(row[h])) {
          warnings.push({
            level: "warn",
            code: "AMBIGUOUS_DATE",
            message: `Column "${h}" value "${row[h]}" is not a recognized date. Expected YYYY-MM-DD or DD/MM/YYYY.`
          });
        }
      }
    }
    return warnings;
  }

  // Duplicate detection across rows (simple signature)
  function findDuplicates(rows, headers) {
    const seen = new Map();
    const dupes = [];
    rows.forEach((row, i) => {
      const sig = headers.map((h) => asText(row[h]).toLowerCase()).join("|");
      if (!sig.replace(/\|/g, "")) return;
      if (seen.has(sig)) dupes.push({ rowIndex: i, duplicateOf: seen.get(sig) });
      else seen.set(sig, i);
    });
    return dupes;
  }

  const api = { asText, looksLikeDate, toISODate, validateRow, findDuplicates };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.Validation = api;
})(typeof window !== "undefined" ? window : self);