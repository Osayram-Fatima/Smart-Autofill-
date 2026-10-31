// shared/adapters/generic.js — standard HTML forms
(function (global) {
  let uidCounter = 0;
  function nextUid() {
    return "f_" + ++uidCounter + "_" + Math.random().toString(36).slice(2, 8);
  }

  function labelFor(el) {
    if (el.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab) return lab.textContent.replace(/\s+/g, " ").trim();
    }
    const parentLabel = el.closest("label");
    if (parentLabel) return parentLabel.textContent.replace(/\s+/g, " ").trim();
    const aria = el.getAttribute("aria-label");
    if (aria) return aria.trim();
    return "";
  }

  function visible(el) {
    if (el.type === "hidden") return false;
    const style = window.getComputedStyle(el);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      parseFloat(style.opacity) === 0
    )
      return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function scan() {
    const fields = [];
    const selector = "input, select, textarea";
    const all = document.querySelectorAll(selector);
    all.forEach((el) => {
      if (!visible(el)) return;
      const tag = el.tagName.toLowerCase();
      const type = tag === "input" ? (el.type || "text").toLowerCase() : tag;

      if (
        [
          "hidden",
          "submit",
          "button",
          "reset",
          "image",
          "file",
          "password",
          "search",
        ].includes(type)
      )
        return;
      if (el.disabled) return;

      const uid =
        el.dataset.autofillUid || (el.dataset.autofillUid = nextUid());
      const field = {
        uid,
        tag,
        type,
        name: el.getAttribute("name") || "",
        id: el.id || "",
        placeholder: el.getAttribute("placeholder") || "",
        label: labelFor(el),
        options:
          tag === "select"
            ? Array.from(el.options)
                .map((o) => ({ value: o.value, text: o.textContent.trim() }))
                .slice(0, 50)
            : null,
        required: !!el.required,
      };
      fields.push(field);
    });
    return fields;
  }

  function setNativeValue(el, value) {
    const proto =
      el.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : el.tagName === "SELECT"
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
  }
  // Naya Function: Website ko dhoka dene ke liye ke insaan type kar raha hai
  async function simulateTyping(el, value) {
    el.focus();
    setNativeValue(el, ""); // Pehle khali karein
    el.dispatchEvent(new Event("input", { bubbles: true })); // Reset event

    const str = String(value);
    for (let i = 0; i < str.length; i++) {
      el.value += str[i];
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(
        new KeyboardEvent("keydown", { key: str[i], bubbles: true }),
      );
      el.dispatchEvent(
        new KeyboardEvent("keypress", { key: str[i], bubbles: true }),
      );
      el.dispatchEvent(
        new KeyboardEvent("keyup", { key: str[i], bubbles: true }),
      );
      // Chota sa wait taake website ko lage insaan type kar raha hai
      await new Promise((r) => setTimeout(r, 10));
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
  }
      async function fillField(field, value) {
    const el = document.querySelector(`[data-autofill-uid="${CSS.escape(field.uid)}"]`);
    if (!el) return { uid: field.uid, ok: false, reason: "element disappeared" };

    const v = value == null ? "" : String(value);

    try {
      if (el.tagName === "SELECT") {
        // SELECT KE LIYE THODA WAIT KAREIN (taake dependent options load ho jayein)
        await new Promise(r => setTimeout(r, 300));

        const opts = Array.from(el.options);
        let chosen = opts.find((o) => o.value === v || o.textContent.trim().toLowerCase() === v.toLowerCase());
        
        if (!chosen) {
           // Agar option phir bhi nahi mila, toh ek aur baar wait karke check karein
           await new Promise(r => setTimeout(r, 500));
           const newOpts = Array.from(el.options);
           chosen = newOpts.find((o) => o.value === v || o.textContent.trim().toLowerCase() === v.toLowerCase());
           
           if (!chosen) {
             return { uid: field.uid, ok: false, reason: `Option "${v}" not found in dropdown.` };
           }
        }
        
        setNativeValue(el, chosen.value);
        el.dispatchEvent(new Event("change", { bubbles: true }));
        
      } else if (el.closest('.select2-container') || el.getAttribute('role') === 'combobox' || el.classList.contains('select2-hidden-accessible')) {
        const container = el.closest('.select2-container') || el.parentElement;
        container.click();
        await new Promise((resolve) => setTimeout(resolve, 300)); 
        
        const options = document.querySelectorAll('.select2-results__option, [role="option"]');
        let clickedOpt = false;
        for (const opt of options) {
           if (opt.textContent.trim().toLowerCase() === v.toLowerCase()) {
              opt.click();
              clickedOpt = true;
              break;
           }
        }
        
        if (!clickedOpt) {
           document.body.click();
           return { uid: field.uid, ok: false, reason: `Custom option "${v}" not found.` };
        }
      } else {
        setNativeValue(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new Event("blur", { bubbles: true }));
      }

      await new Promise((r) => setTimeout(r, 30));
      return { uid: field.uid, ok: true, reason: "" };

    } catch (e) {
      return { uid: field.uid, ok: false, reason: e.message };
    }
  }

  async function fill(fields, mappingPlan, studentRow) {
    const results = [];
    for (const m of mappingPlan) {
      if (!m.fieldUid || !m.column) continue;
      const field = fields.find((f) => f.uid === m.fieldUid);
      if (!field) continue;
      const val = studentRow[m.column];
      const r = await fillField(field, val);
      r.column = m.column;
      results.push(r);
    }
    return results;
  }

  function clear(fields) {
    const cleared = [];
    for (const f of fields) {
      const el = document.querySelector(
        `[data-autofill-uid="${CSS.escape(f.uid)}"]`,
      );
      if (!el) continue;
      setNativeValue(el, "");
      cleared.push(f.uid);
    }
    return cleared;
  }

  global.GenericAdapter = { scan, fill, clear, fillField };
})(typeof window !== "undefined" ? window : self);
