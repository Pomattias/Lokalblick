// Provider-neutral map facade used by Lokalblick UI.
// The UI must never call Leaflet/Azure Maps/Mapbox directly.
(function () {
  let adapter = null;
  let handle = null;
  const auxiliary = new Set();

  function requireAdapter() {
    if (!adapter) throw new Error("No Lokalblick map adapter configured");
    return adapter;
  }

  window.LokalblickMapService = {
    configure(nextAdapter) {
      if (!nextAdapter || typeof nextAdapter.create !== "function") {
        throw new Error("Invalid Lokalblick map adapter");
      }
      this.destroy();
      auxiliary.forEach(item => { try { item.destroy(); } catch (_) {} });
      auxiliary.clear();
      adapter = nextAdapter;
    },

    getProviderName() {
      return adapter && adapter.name ? adapter.name : "none";
    },

    render(options) {
      const provider = requireAdapter();
      this.destroy();
      handle = provider.create(options || {});
      return handle;
    },

    // Independent embedded maps leave the active portfolio map untouched.
    createAuxiliary(options) {
      const provider=requireAdapter();
      const mapHandle=provider.create(options || {});
      const controller={
        invalidateSize: () => provider.invalidateSize?.(mapHandle),
        destroy: () => {
          if (!auxiliary.has(controller)) return;
          auxiliary.delete(controller);
          provider.destroy(mapHandle);
        }
      };
      auxiliary.add(controller);
      return controller;
    },

    update(points) {
      const provider = requireAdapter();
      if (!handle) return;
      provider.update(handle, Array.isArray(points) ? points : []);
    },

    invalidateSize() {
      const provider = requireAdapter();
      if (handle && typeof provider.invalidateSize === "function") {
        provider.invalidateSize(handle);
      }
    },

    destroy() {
      if (handle && adapter && typeof adapter.destroy === "function") {
        adapter.destroy(handle);
      }
      handle = null;
    }
  };
})();
