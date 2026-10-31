// shared/matching.js — field scoring

(function (global) {
  const STOPWORDS = new Set([
    "the", "a", "an", "of", "and", "or", "for", "to", "in", "on", "with",
    "your", "please", "enter", "select", "provide", "field", "required"
  ]);

  function normalize(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function tokens(s) {
    return normalize(s)
      .split(" ")
      .filter((t) => t && !STOPWORDS.has(t));
  }

  function levenshtein(a, b) {
    a = a || ""; b = b || "";
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
    }
    return dp[m][n];
  }

  function similarity(a, b) {
    a = normalize(a); b = normalize(b);
    if (!a || !b) return 0;
    if (a === b) return 1;
    const dist = levenshtein(a, b);
    return 1 - dist / Math.max(a.length, b.length);
  }

  // Score how well an Excel column matches a detected field.
  function scoreField(column, field) {
    const reasons = [];
    let score = 0;

    const colNorm = normalize(column);
    const colTokens = new Set(tokens(column));

    // 1. Exact label match (strong)
    if (field.label && normalize(field.label) === colNorm) {
      score += 60;
      reasons.push("exact label");
    } else if (field.label) {
      const s = similarity(field.label, column);
      if (s >= 0.8) { score += 40; reasons.push("similar label (" + s.toFixed(2) + ")"); }
      else if (s >= 0.6) { score += 20; reasons.push("weak label similarity"); }
    }

    // 2. name / id / placeholder
    for (const key of ["name", "id", "placeholder"]) {
      const val = field[key];
      if (!val) continue;
      if (normalize(val) === colNorm) {
        score += 35;
        reasons.push("exact " + key);
      } else {
        const s = similarity(val, column);
        if (s >= 0.85) { score += 25; reasons.push("similar " + key); }
        else if (s >= 0.65) { score += 10; reasons.push("weak " + key); }
      }
      
      const fTokens = tokens(val);
      const overlap = fTokens.filter((t) => colTokens.has(t)).length;
      if (overlap > 0) {
        score += Math.min(15, overlap * 8);
        reasons.push("token overlap (" + key + ")");
      }
    }

    // 3. type hints
    if (field.type === "date" && /date|dob|birth/i.test(column)) {
      score += 20;
      reasons.push("type=date hint");
    }
    if ((field.type === "email" || field.type === "tel") &&
        /email|phone|mobile|contact|cell/i.test(column)) {
      score += 20;
      reasons.push("type hint: " + field.type);
    }
    if (field.type === "number" && /number|roll|id|rollno/i.test(column)) {
      score += 10;
      reasons.push("type=number hint");
    }

    return { score: Math.min(100, score), reasons };
  }

  // Build best mapping suggestions: each column → best field (unique field per column)
  function suggestMappings(headers, fields) {
    const results = [];

    const colScores = headers.map((col) => {
      const scored = fields.map((f) => ({ field: f, ...scoreField(col, f) }));
      scored.sort((a, b) => b.score - a.score);
      return { col, scored };
    });

    const pairs = [];
    for (const { col, scored } of colScores) {
      for (const s of scored) {
        if (s.score >= 40) pairs.push({ col, field: s.field, score: s.score, reasons: s.reasons });
      }
    }
    pairs.sort((a, b) => b.score - a.score);

    const assignedCols = new Set();
    const assignedFields = new Set();
    for (const p of pairs) {
      if (assignedCols.has(p.col) || assignedFields.has(p.field.uid)) continue;
      assignedCols.add(p.col);
      assignedFields.add(p.field.uid);
      results.push({
        column: p.col,
        fieldUid: p.field.uid,
        fieldLabel: p.field.label || p.field.name || p.field.id || p.field.placeholder || "",
        confidence: p.score,
        reasons: p.reasons,
        needsReview: p.score < 70
      });
    }

    for (const h of headers) {
      if (!assignedCols.has(h)) {
        results.push({ column: h, fieldUid: null, fieldLabel: "", confidence: 0, reasons: [], needsReview: true });
      }
    }
    return results;
  }

  global.Matching = { normalize, tokens, similarity, scoreField, suggestMappings };
})(typeof window !== "undefined" ? window : self);