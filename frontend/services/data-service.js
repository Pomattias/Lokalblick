// Public demo data adapter.
// Production/Teams will replace this with an authenticated backend API adapter.
(function () {
  const DEMO_KEY = "lokalblick-public-demo-v1";
  const LEGACY_KEY = "lokalblick-v2";

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  // The old prototype could locally import LEB. Never reuse that storage
  // in the public demo after the frontend/backend split.
  try { localStorage.removeItem(LEGACY_KEY); } catch (_) {}

  window.LokalblickDataService = {
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
})();
