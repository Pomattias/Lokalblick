// Public demo data adapter.
// Production/Teams or local source adapters may replace window.LokalblickDataService at runtime.
(function () {
  const DEMO_KEY = "lokalblick-public-demo-v1";
  const LEGACY_KEY = "lokalblick-v2";

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  try { localStorage.removeItem(LEGACY_KEY); } catch (_) {}

  const VIEW_DB_NAME = "lokalblick-view-bridge";
  const VIEW_STORE = "state";
  const VIEW_SESSION_KEY = "lokalblick-view-session";

  function viewSessionId() {
    try {
      let id = sessionStorage.getItem(VIEW_SESSION_KEY);
      if (!id) {
        id = (globalThis.crypto && crypto.randomUUID)
          ? crypto.randomUUID()
          : "session-" + Date.now() + "-" + Math.random().toString(36).slice(2);
        sessionStorage.setItem(VIEW_SESSION_KEY, id);
      }
      return id;
    } catch (_) {
      return "current";
    }
  }

  function openViewDb() {
    return new Promise(function(resolve, reject) {
      const request = indexedDB.open(VIEW_DB_NAME, 1);
      request.onupgradeneeded = function() {
        if (!request.result.objectStoreNames.contains(VIEW_STORE))
          request.result.createObjectStore(VIEW_STORE);
      };
      request.onsuccess = function() { resolve(request.result); };
      request.onerror = function() { reject(request.error); };
    });
  }

  async function readViewState() {
    try {
      const db = await openViewDb();
      const tx = db.transaction(VIEW_STORE, "readonly");
      const request = tx.objectStore(VIEW_STORE).get(viewSessionId());
      const saved = await new Promise(function(resolve, reject) {
        request.onsuccess = function() { resolve(request.result || null); };
        request.onerror = function() { reject(request.error); };
      });
      return saved && saved.data ? clone(saved) : null;
    } catch (_) {
      return null;
    }
  }

  async function writeViewState(data, meta) {
    if (!data) return null;
    const payload = {
      data: clone(data),
      meta: Object.assign({}, meta || {}),
      savedAt: new Date().toISOString()
    };
    try {
      const db = await openViewDb();
      const tx = db.transaction(VIEW_STORE, "readwrite");
      tx.objectStore(VIEW_STORE).put(payload, viewSessionId());
      await new Promise(function(resolve, reject) {
        tx.oncomplete = resolve;
        tx.onerror = function() { reject(tx.error); };
        tx.onabort = function() { reject(tx.error); };
      });
      return clone(payload);
    } catch (_) {
      return null;
    }
  }

  async function clearViewState() {
    try {
      const db = await openViewDb();
      const tx = db.transaction(VIEW_STORE, "readwrite");
      tx.objectStore(VIEW_STORE).delete(viewSessionId());
      // Wait until the transaction commits so a later reload cannot resurrect
      // the old workspace immediately after an explicit demo reset.
      await new Promise(function(resolve,reject){
        tx.oncomplete=resolve;
        tx.onerror=function(){reject(tx.error);};
        tx.onabort=function(){reject(tx.error);};
      });
    } catch (_) {}
  }

  const bridgeService = {
    mode: "view-bridge",
    async load() {
      const saved = await readViewState();
      return saved ? clone(saved.data) : clone(window.LokalblickDemoData);
    },
    async save(data) {
      await writeViewState(data, { source: "view-bridge" });
      return clone(data);
    },
    async reset() {
      await clearViewState();
      return clone(window.LokalblickDemoData);
    }
  };

  window.LokalblickViewBridge = {
    load: readViewState,
    save: writeViewState,
    clear: clearViewState,
    activate: function() {
      window.LokalblickDataService = bridgeService;
      return bridgeService;
    },
    activateStored: async function() {
      const saved = await readViewState();
      if (!saved) return null;
      window.LokalblickDataService = bridgeService;
      return clone(saved.data);
    }
  };

  const demoService = {
    mode: "demo",

    async load() {
      try {
        const raw = localStorage.getItem(DEMO_KEY);
        if (!raw) return clone(window.LokalblickDemoData);
        const parsed = JSON.parse(raw);
        const hasCoreDemoData =
          parsed &&
          Array.isArray(parsed.properties) && parsed.properties.length > 0 &&
          Array.isArray(parsed.contracts) && parsed.contracts.length > 0;
        if (!hasCoreDemoData) {
          localStorage.removeItem(DEMO_KEY);
          return clone(window.LokalblickDemoData);
        }
        return parsed;
      } catch (_) {
        try { localStorage.removeItem(DEMO_KEY); } catch (_) {}
        return clone(window.LokalblickDemoData);
      }
    },

    async save(data) {
      const safe = clone(data);
      safe.isDemo = true;
      safe.sourceName = "Publik demodata";
      try { localStorage.setItem(DEMO_KEY, JSON.stringify(safe)); } catch (_) {}
      return safe;
    },

    async reset() {
      try { localStorage.removeItem(DEMO_KEY); } catch (_) {}
      return clone(window.LokalblickDemoData);
    }
  };

  window.LokalblickDemoDataService = demoService;
  window.LokalblickDataService = demoService;
})();