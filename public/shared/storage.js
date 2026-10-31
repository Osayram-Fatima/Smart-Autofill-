/* global chrome */
// shared/storage.js — thin wrapper over chrome.storage.local

(function (global) {
  const KEYS = {
    STUDENTS: "students_v1",
    MAPPINGS_PREFIX: "mappings_v1:"
  };

  function get(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (res) => resolve(res[key]));
    });
  }
  
  function set(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => resolve());
    });
  }
  
  function remove(key) {
    return new Promise((resolve) => {
      chrome.storage.local.remove([key], () => resolve());
    });
  }
  
  function clearAll() {
    return new Promise((resolve) => {
      chrome.storage.local.clear(() => resolve());
    });
  }

  global.StorageMgr = {
    KEYS,
    get,
    set,
    remove,
    clearAll,

    async getStudents() {
      return (await get(KEYS.STUDENTS)) || { headers: [], rows: [], fileName: "", importedAt: null };
    },
    async setStudents(payload) {
      return set(KEYS.STUDENTS, payload);
    },
    async getMappings(hostname) {
      return (await get(KEYS.MAPPINGS_PREFIX + hostname)) || { hostname, mappings: [], savedAt: null };
    },
    async setMappings(hostname, mappings) {
      return set(KEYS.MAPPINGS_PREFIX + hostname, {
        hostname,
        mappings,
        savedAt: Date.now()
      });
    }
  };
})(typeof window !== "undefined" ? window : self);