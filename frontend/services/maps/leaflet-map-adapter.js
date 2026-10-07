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
      let marker;
      if (Number.isFinite(Number(point.metricRatio))) {
        const ratio=Math.max(0.04,Math.min(1,Number(point.metricRatio)||0));
        const height=Math.round(18 + ratio * 64);
        const label=String(point.metricLabel || "");
        const icon=L.divIcon({
          className:"lokalblick-map-bar-icon",
          html:'<div class="lokalblick-map-bar-wrap" style="height:' + (height+22) + 'px">' +
            '<span class="lokalblick-map-bar-label">' + label.replace(/[&<>"']/g,function(ch){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];}) + '</span>' +
            '<span class="lokalblick-map-bar" style="height:' + height + 'px"></span>' +
            '<span class="lokalblick-map-bar-dot"></span></div>',
          iconSize:[52,height+22],
          iconAnchor:[26,height+20]
        });
        marker=L.marker([Number(point.latitude), Number(point.longitude)], { icon:icon, riseOnHover:true });
      } else {
        marker = L.circleMarker(
          [Number(point.latitude), Number(point.longitude)],
          {
            radius: 9,
            weight: 3,
            opacity: 1,
            fillOpacity: 0.82
          }
        );
      }

      if (point.popupHtml) {
        marker.bindPopup(point.popupHtml, {
          closeButton: false,
          autoPanPadding: [24, 24]
        });
        marker.on("mouseover", function() { this.openPopup(); });
        marker.on("mouseout", function() { this.closePopup(); });
        marker.on("click", function() {
          this.openPopup();
          if (typeof handle.onPointClick === "function") handle.onPointClick(point);
        });
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
        fallbackCenter: fallbackCenter,
        onPointClick: typeof options.onPointClick === "function" ? options.onPointClick : null
      };

      addPoints(handle, options.points || []);
      handle.resizeTimer = setTimeout(function() { map.invalidateSize(); }, 0);
      return handle;
    },

    update(handle, points) {
      addPoints(handle, points);
    },

    invalidateSize(handle) {
      handle.map.invalidateSize();
    },

    destroy(handle) {
      clearTimeout(handle.resizeTimer);
      // Leaflet 1.9.4 leaves its deferred wheel zoom running after remove().
      clearTimeout(handle.map.scrollWheelZoom && handle.map.scrollWheelZoom._timer);
      handle.map.remove();
    }
  };

  window.LokalblickMapService.configure(adapter);
})();
