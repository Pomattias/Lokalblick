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
        return raw ? JSON.parse(raw) : clone(window.LokalblickDemoData);
      } catch (_) {
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
