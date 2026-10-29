// Leaflet adapter using the same CARTO Voyager basemap as Velovista.
// Falls back to OSM if CARTO cannot be used.
(function () {
  function validPoint(point) {
    return Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude));
  }

  function addPoints(handle, points) {
    handle.markers.clearLayers();
    const bounds = [];
    handle.pointMarkers=new Map();

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
          closeButton: Boolean(handle.interactivePopups),
          ...(handle.interactivePopups?{minWidth:230,maxWidth:360,className:"portfolio-map-popup"}:{}),
          autoPanPadding: [24, 24]
        });
        if(!handle.interactivePopups){
          marker.on("mouseover", function() { this.openPopup(); });
          marker.on("mouseout", function() { this.closePopup(); });
        }
        marker.on("click", function() {
          this.openPopup();
          if (!handle.interactivePopups&&typeof handle.onPointClick === "function") handle.onPointClick(point);
        });
      }

      marker.addTo(handle.markers);
      handle.pointMarkers.set(point.id,marker);
      if(handle.interactivePopups){
        handle.map.whenReady(function(){
          const element=marker.getElement();
          if(!element)return;
          element.setAttribute("tabindex","0");element.setAttribute("role","button");
          element.setAttribute("aria-label",point.designation||point.address||"Fastighet");
          element.addEventListener("keydown",function(event){
            if(event.key!=="Enter"&&event.key!==" ")return;
            event.preventDefault();event.stopPropagation();marker.openPopup();
          });
        });
        marker.on("popupopen",function(){
          handle.openPointId=point.id;
          fitPopup(handle,marker);
        });
        marker.on("popupclose",function(){if(handle.openPointId===point.id)handle.openPointId=null;});
      }
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

  function fitPopup(handle,marker) {
    const popup=marker.getPopup();
    popup.options.maxHeight=Math.max(100,Math.min(440,handle.map.getSize().y-100));
    popup.update();
  }

  const adapter = {
    name: "leaflet-carto",

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

      const cartoKey =
        window.LokalblickRuntime && window.LokalblickRuntime.cartoApiKey
          ? String(window.LokalblickRuntime.cartoApiKey).trim()
          : "";
      const cartoBase =
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
      const cartoUrl = cartoKey
        ? cartoBase + "?key=" + encodeURIComponent(cartoKey)
        : cartoBase;
      const primary = L.tileLayer(cartoUrl, {
        subdomains: "abcd",
        maxZoom: 20,
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
      });
      const fallback = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          subdomains: "abc",
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap contributors"
        }
      );
      let fallbackActivated = false;
      primary.on("tileerror", function () {
        if (fallbackActivated) return;
        fallbackActivated = true;
        try {
          map.removeLayer(primary);
          fallback.addTo(map);
        } catch (_) {}
      });
      primary.addTo(map);

      const handle = {
        map: map,
        markers: L.layerGroup().addTo(map),
        fallbackCenter: fallbackCenter,
        interactivePopups:Boolean(options.interactivePopups),
        onPointClick: typeof options.onPointClick === "function" ? options.onPointClick : null
      };

      if(handle.interactivePopups)map.on("resize",function(){
        for(const marker of handle.pointMarkers.values())if(marker.isPopupOpen())fitPopup(handle,marker);
      });
      addPoints(handle, options.points || []);
      if(options.initialView){
        map.setView(options.initialView.center,options.initialView.zoom);
        handle.pointMarkers.get(options.initialView.openPointId)?.openPopup();
      }

      // An editor can position one selected building without editing the full
      // property-map layer. Click or drag only changes pending form values.
      if (typeof options.onSelectPosition === "function") {
        let selectedMarker=null;
        const selected=options.selectedPosition;
        function setPoint(pos, notify) {
          if (!pos || !Number.isFinite(Number(pos.lat)) || !Number.isFinite(Number(pos.lng)) ||
              Math.abs(Number(pos.lat))>90 || Math.abs(Number(pos.lng))>180) return;
          if (!selectedMarker) {
            selectedMarker=L.marker([Number(pos.lat),Number(pos.lng)],{draggable:true}).addTo(map);
            selectedMarker.on("dragend",function(){ setPoint(selectedMarker.getLatLng(),true); });
          } else {
            selectedMarker.setLatLng([Number(pos.lat),Number(pos.lng)]);
          }
          if (notify) options.onSelectPosition({latitude:Number(pos.lat),longitude:Number(pos.lng)});
        }
        if (selected && Number.isFinite(Number(selected.latitude)) &&
            Number.isFinite(Number(selected.longitude))) {
          setPoint({lat:selected.latitude,lng:selected.longitude},false);
          map.setView([Number(selected.latitude),Number(selected.longitude)],17);
        }
        map.on("click",function(event){ setPoint(event.latlng,true); });
        handle.setSelectedPosition = function(position) {
          setPoint({lat:position.latitude,lng:position.longitude},false);
          map.setView([Number(position.latitude),Number(position.longitude)],17);
        };
      }
      handle.resizeTimer = setTimeout(function() { map.invalidateSize(); }, 0);
      return handle;
    },

    getView(handle) {
      const center=handle.map.getCenter();
      return {center:[center.lat,center.lng],zoom:handle.map.getZoom(),openPointId:handle.openPointId};
    },

    update(handle, points) {
      addPoints(handle, points);
    },

    invalidateSize(handle) {
      handle.map.invalidateSize();
    },

    setSelectedPosition(handle, position) {
      handle.setSelectedPosition?.(position);
    },

    destroy(handle) {
      clearTimeout(handle.resizeTimer);
      // Leaflet 1.9.4 leaves its deferred wheel zoom running after remove().
      clearTimeout(handle.map.scrollWheelZoom && handle.map.scrollWheelZoom._timer);
      // Its zoom-transition timeout also survives remove(). Complete the
      // transition while panes exist so that the later callback becomes a no-op.
      handle.map.stop();
      if (handle.map._animatingZoom) handle.map._onZoomTransitionEnd();
      handle.map.remove();
    }
  };

  window.LokalblickMapService.configure(adapter);
})();
