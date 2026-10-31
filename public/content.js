/* global chrome */
// content.js — runs on every page. Handles scan / fill / clear / verify.
// Uses: window.Matching, window.Validation, window.GenericAdapter, window.AdapterRegistry, window.StorageMgr.

(function () {
  const adapter = () =>
    window.AdapterRegistry
      ? window.AdapterRegistry.pickAdapter(location.hostname)
      : { name: "generic" };

  function storageAvailable() {
    return !!window.StorageMgr;
  }

  async function getSavedMappings() {
    if (storageAvailable())
      return (
        (await window.StorageMgr.getMappings(location.hostname)).mappings || []
      );
    return new Promise((resolve) => {
      chrome.storage.local.get(["mappings_v1:" + location.hostname], (res) => {
        resolve(res["mappings_v1:" + location.hostname]?.mappings || []);
      });
    });
  }

  async function saveMappings(mappings) {
    if (storageAvailable())
      return window.StorageMgr.setMappings(location.hostname, mappings);
    return new Promise((resolve) => {
      chrome.storage.local.set(
        {
          ["mappings_v1:" + location.hostname]: {
            hostname: location.hostname,
            mappings,
            savedAt: Date.now(),
          },
        },
        resolve,
      );
    });
  }

  async function handleScan() {
    const fields = window.GenericAdapter.scan(document);
    return {
      hostname: location.hostname,
      url: location.href,
      adapterName: adapter().name,
      fields,
    };
  }

  async function handleSuggest(headers) {
    const fields = window.GenericAdapter.scan(document);
    const saved = await getSavedMappings();
    const savedByColumn = new Map(saved.map((m) => [m.column, m]));

    const suggestions = window.Matching.suggestMappings(headers, fields);
    const out = suggestions.map((s) => {
      const savedM = savedByColumn.get(s.column);
      if (savedM && fields.some((f) => f.uid === savedM.fieldUid)) {
        return {
          ...savedM,
          confidence: 100,
          reasons: ["saved mapping"],
          needsReview: false,
        };
      }
      return s;
    });
    return { fields, suggestions: out, savedCount: saved.length };
  }

    async function handleFill(payload) {
    const fields = window.GenericAdapter ? window.GenericAdapter.scan() : [];
    if (!window.GenericAdapter) return { adapterName: "generic", results: [] };

    const results = [];

    for (const plan of payload.mappingPlan) {
      const rawValue = payload.studentRow[plan.column] || "";
      if (!rawValue) continue;

      if (plan.fieldUid2) {
        let val1 = rawValue;
        let val2 = rawValue;
        // (Phone/Date split logic remains the same)
        if (plan.column.toLowerCase().includes("phone") || plan.column.toLowerCase().includes("mobile")) {
           const match = rawValue.match(/^\+?(\d{1,3})\s*(.*)$/); 
           if (match && rawValue.includes("+")) {
             val1 = match[1]; val2 = match[2].replace(/\D/g, ''); 
           } else {
             val1 = "PK"; val2 = rawValue.replace(/\D/g, ''); 
           }
        }
        const f1 = fields.find(f => f.uid === plan.fieldUid);
        if (f1) {
           const r1 = await window.GenericAdapter.fillField(f1, val1);
           results.push({ ...r1, column: plan.column + " (Part 1)" });
        }
        const f2 = fields.find(f => f.uid === plan.fieldUid2);
        if (f2) {
           const r2 = await window.GenericAdapter.fillField(f2, val2);
           results.push({ ...r2, column: plan.column + " (Part 2)" });
        }
      } else {
        const f = fields.find(x => x.uid === plan.fieldUid);
        if (f) {
          const r = await window.GenericAdapter.fillField(f, rawValue);
          results.push({ ...r, column: plan.column });
        }
      }

      // CRITICAL FIX: Dependent Dropdowns ke liye 800ms (0.8 sec) ka delay
      await new Promise(r => setTimeout(r, 300)); 
    }

    return { adapterName: adapter().name, handledBySiteAdapter: false, results };
  }

  function handleClear() {
    const fields = window.GenericAdapter.scan(document);
    const cleared = window.GenericAdapter.clear(fields);
    return { clearedCount: cleared.length };
  }

  async function handleSaveMappings(mappings) {
    await saveMappings(mappings);
    return { ok: true, count: mappings.length };
  }

  // Message listener
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
      try {
        switch (msg.action) {
          case "SCAN":
            sendResponse({ ok: true, data: await handleScan() });
            break;
          case "SUGGEST":
            sendResponse({
              ok: true,
              data: await handleSuggest(msg.headers || []),
            });
            break;
          case "FILL":
            sendResponse({ ok: true, data: await handleFill(msg) });
            break;
          case "SUBMIT_PAGE": {
            const submitBtns = document.querySelectorAll(
              'button[type="submit"], input[type="submit"], button',
            );
            let clicked = false;
            for (const btn of submitBtns) {
              const btnText = (btn.innerText || btn.value || "").toLowerCase();
              if (
                btnText.includes("submit") ||
                btnText.includes("register") ||
                btnText.includes("save") ||
                btnText.includes("confirm")
              ) {
                btn.click();
                clicked = true;
                break;
              }
            }

            if (clicked) {
              sendResponse({ ok: true, data: { submitted: true } });
            } else {
              const fallbackBtn = document.querySelector(
                'button[type="submit"], input[type="submit"]',
              );
              if (fallbackBtn) {
                fallbackBtn.click();
                sendResponse({ ok: true, data: { submitted: true } });
              } else {
                sendResponse({
                  ok: false,
                  error: "Submit button nahi mila page par.",
                });
              }
            }
            break;
          }
          case "CLEAR":
            sendResponse({ ok: true, data: handleClear() });
            break;
          case "SAVE_MAPPINGS":
            sendResponse({
              ok: true,
              data: await handleSaveMappings(msg.mappings || []),
            });
            break;
          default:
            sendResponse({ ok: false, error: "Unknown action: " + msg.action });
        }
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true; // async
  });

  // Sirf EK baar pageshow event lagayein
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      console.log("[Smart Autofill] Page restored from cache (Back/Forward).");
    }
    try {
      chrome.runtime.sendMessage({
        type: "PAGE_LOADED",
        url: window.location.href,
      });
    } catch (e) {
      console.log("Error sending PAGE_LOADED message:", e);
    }
  });

  // Announce presence
  console.log("[Smart Autofill] content script ready on", location.hostname);
})();