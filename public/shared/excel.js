// shared/excel.js — parse .xlsx/.xls via SheetJS (must be loaded first)
// Exposes window.ExcelMgr.

(function (global) {
  function ensureXLSX() {
    if (typeof global.XLSX === "undefined") {
      throw new Error(
        "SheetJS library not loaded. Ensure lib/xlsx.full.min.js exists and is included before excel.js."
      );
    }
  }

  async function parseFile(file) {
    ensureXLSX();
    const buf = await file.arrayBuffer();
    const wb = global.XLSX.read(buf, { type: "array", cellDates: false, raw: true });
    const firstSheet = wb.SheetNames[0];
    if (!firstSheet) throw new Error("Workbook has no sheets.");
    const ws = wb.Sheets[firstSheet];

    // Get headers from row 1
    const aoa = global.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
    if (!aoa.length) throw new Error("Sheet is empty.");

    const headers = (aoa[0] || []).map((h) => String(h || "").trim());
    // Ensure unique headers
    const seen = new Map();
    const uniqueHeaders = headers.map((h) => {
      if (!h) h = "Column";
      const n = seen.get(h) || 0;
      seen.set(h, n + 1);
      return n === 0 ? h : `${h} (${n + 1})`;
    });

    const rows = [];
    for (let r = 1; r < aoa.length; r++) {
      const arr = aoa[r] || [];
      if (arr.every((v) => v === "" || v === null || v === undefined)) continue;
      const obj = {};
      uniqueHeaders.forEach((h, i) => {
        // Preserve everything as text; date/id leading zeros safe.
        let v = arr[i];
        if (v === null || v === undefined) v = "";
        obj[h] = typeof v === "string" ? v : String(v);
      });
      rows.push(obj);
    }

    return {
      headers: uniqueHeaders,
      rows,
      fileName: file.name,
      importedAt: Date.now(),
      sheetName: firstSheet
    };
  }

  global.ExcelMgr = { parseFile };
})(typeof window !== "undefined" ? window : self);