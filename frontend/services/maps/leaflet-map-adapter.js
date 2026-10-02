// Leaflet/OpenStreetMap adapter for the public demo.
// Replace this adapter to use another approved map provider.
(function () {
  function validPoint(point) {
    return Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude));
  }

  function addPoints(handle, points) {
    handle.markers.clearLayers();
    const bounds = [];

    (points || []).filter(validPoint).forEach(function(point) {
      const marker = L.circleMarker(
        [Number(point.latitude), Number(point.longitude)],
        {
          radius: 9,
          weight: 3,
          opacity: 1,
          fillOpacity: 0.82
        }
      );

      if (point.popupHtml) {
        marker.bindPopup(point.popupHtml, {
          closeButton: false,
          autoPanPadding: [24, 24]
        });
        marker.on("mouseover", function() { this.openPopup(); });
        marker.on("mouseout", function() { this.closePopup(); });
        marker.on("click", function() { this.openPopup(); });
      }

      marker.addTo(handle.markers);
      bounds.push([Number(point.latitude), Number(point.longitude)]);
    });

    if (bounds.length === 1) {
      handle.map.setView(bounds[0], 15);
    } else if (bounds.length > 1) {
      handle.map.fitBounds(bounds, { padding: [36, 36] });
    } else {
      handle.map.setView(
        [handle.fallbackCenter.latitude, handle.fallbackCenter.longitude],
        handle.fallbackCenter.zoom
      );
    }
  }

  const adapter = {
    name: "leaflet-osm",

    create(options) {
      if (!window.L) throw new Error("Leaflet is not available");
      const element = document.getElementById(options.elementId);
      if (!element) throw new Error("Map element not found: " + options.elementId);

      const fallbackCenter = Object.assign(
        { latitude: 55.6050, longitude: 13.0038, zoom: 12 },
        options.fallbackCenter || {}
      );

      const map = L.map(element, {
        zoomControl: true,
        scrollWheelZoom: true
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap"
      }).addTo(map);

      const handle = {
        map: map,
        markers: L.layerGroup().addTo(map),
        fallbackCenter: fallbackCenter
      };

      addPoints(handle, options.points || []);
      setTimeout(function() { map.invalidateSize(); }, 0);
      return handle;
    },

    update(handle, points) {
      addPoints(handle, points);
    },

    invalidateSize(handle) {
      handle.map.invalidateSize();
    },

    destroy(handle) {
      handle.map.remove();
    }
  };

  window.LokalblickMapService.configure(adapter);
})();
