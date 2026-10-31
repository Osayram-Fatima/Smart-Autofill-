// shared/adapters/example-site-adapter.js
// Template for site-specific adapters. NOT active for any real domain
// until you edit `matchHost` and implement `prefill`.
// Generic adapter is the fallback when no site adapter matches.

(function (global) {
  // Return true only if this adapter should handle the current hostname.
  function matchHost(hostname) {
    // Example: return hostname === "portal.example.edu";
    return false;
  }

  // Called before generic scan; can do lookups, dropdown triggers, etc.
  // Return {handled: true} if it fully handled the fill and generic should skip.
  async function prefill(context) {
    // context = { studentRow, mappingPlan, fields }
    return { handled: false };
  }

  global.SiteAdapters = global.SiteAdapters || [];
  global.SiteAdapters.push({ name: "example-site", matchHost, prefill });
})(typeof window !== "undefined" ? window : self);