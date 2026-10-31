(function (global) {
  function asText(v) {
    if (v === null || v === undefined) return "";
    return String(v).trim();
  }

  function looksLikeDate(v) {
    const s = String(v);
    const p1 = /^\d{4}-\d{2}-\d{2}$/;
    const p2 = /^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/;
    return p1.test(s) || p2.test(s);
  }

  function toISODate(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (!s) return null;

    const pIso = /^\d{4}-\d{2}-\d{2}$/;
    if (pIso.test(s)) return s;
    
    const pNum = /^\d{5}$/;
    if (pNum.test(s)) {
      const epoch = new Date(Date.UTC(1899, 11, 30));
      const days = parseInt(s, 10);
      const date = new Date(epoch.getTime() + days * 86400000); 
      
      if (!isNaN(date.getTime())) {
        const yyyy = date.getUTCFullYear();
        const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(date.getUTCDate()).padStart(2, "0");
        return yyyy + "-" + mm + "-" + dd; 
      }
    }
    
    const pText = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/;
    const m = s.match(pText);
    if (m) {
      let part1 = m[1];
      let part2 = m[2];
      let y = m[3];
      let d = part1;
      let mo = part2;
      
      if (parseInt(part1) <= 12 && parseInt(part2) > 12) {
         d = part2;
         mo = part1;
      }
      
      if (y.length === 2) y = (parseInt(y, 10) > 30 ? "19" : "20") + y;
      const dd = String(d).padStart(2, "0");
      const mm = String(mo).padStart(2, "0");
      const dt = new Date(y + "-" + mm + "-" + dd + "T00:00:00");
      
      if (!isNaN(dt.getTime())) return y + "-" + mm + "-" + dd;
    }
    return null;
  }

  function validateRow(row, headers) {
    const warnings = [];
    if (!row) return [{ level: "error", code: "EMPTY_ROW", message: "Row is empty." }];

    const emptyCount = headers.filter(function(h) { return !asText(row[h]); }).length;
    
    if (emptyCount === headers.length) {
      warnings.push({ level: "error", code: "ALL_EMPTY", message: "All columns empty for this row." });
    } else if (emptyCount > 0) {
      warnings.push({
        level: "warn",
        code: "PARTIAL_EMPTY",
        message: emptyCount + " field(s) are empty. Fill carefully."
      });
    }

    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      if (/date|dob|birth/i.test(h) && row[h]) {
        if (!toISODate(row[h])) {
          warnings.push({
            level: "warn",
            code: "AMBIGUOUS_DATE",
            message: "Column " + h + " value " + row[h] + " is not a recognized date."
          });
        }
      }
    }
    return warnings;
  }

  function findDuplicates(rows, headers) {
    const seen = new Map();
    const dupes = [];
    rows.forEach(function(row, i) {
      const sig = headers.map(function(h) { return asText(row[h]).toLowerCase(); }).join("|");
      if (!sig.replace(/\|/g, "")) return;
      if (seen.has(sig)) dupes.push({ rowIndex: i, duplicateOf: seen.get(sig) });
      else seen.set(sig, i);
    });
    return dupes;
  }

  global.Validation = { asText: asText, looksLikeDate: looksLikeDate, toISODate: toISODate, validateRow: validateRow, findDuplicates: findDuplicates };
})(typeof window !== "undefined" ? window : self);