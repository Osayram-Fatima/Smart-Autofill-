// shared/adapters/registry.js
(function (global) {
  function pickAdapter(hostname) {
    const list = global.SiteAdapters || [];
    for (const a of list) {
      try {
        if (a.matchHost(hostname)) return a;
      } catch (err) {
        console.error("[Smart Autofill] Adapter match error:", err);
      }
    }
    return {
      name: "generic",
      matchHost: () => true,
      prefill: async () => ({ handled: false })
    };
  }
  global.AdapterRegistry = { pickAdapter };
})(typeof window !== "undefined" ? window : self);