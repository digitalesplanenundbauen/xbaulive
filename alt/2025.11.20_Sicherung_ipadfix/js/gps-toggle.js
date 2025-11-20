// xbaulive/js/gps-toggle.js
// GPS-Umschaltung (Simulation ↔ echtes GPS) für AR.js/A-Frame
// - Schaltet nur die gps-camera-Attribute an der bestehenden Kamera um (kein DOM-Rebuild der Kamera)
// - Aktualisiert Status/Buttons und Modellposition je Modus
// - Hält das Kameravideo auf iOS/Android stabil am Laufen (playsinline/muted/autoplay + auto-resume)
// - Bindet gps-entity-place nach Umschalten erneut an die gps-camera-Komponente

(function(){
  // ------- GPS Toggle: Simulation ↔ echtes GPS -------
  const scene = document.querySelector('a-scene');
  const gpsBtn = document.getElementById('gpsBtn');
  const gpsStatus = document.getElementById('gps-status');

  // Zielzustände:
  // - Simulation: gps-camera nutzt simulateLatitude/Longitude, Modell leicht versetzt
  // - Echt-GPS:   gps-camera nutzt reale Geoposition (watchPosition), Modell bei 0 0 0

  // Zentrale Konfiguration (hier einfach anpassbar)
  const CONFIG = {
    sim: {
      lat: 47.866880722,
      lon: 12.109128178,
      modelPosition: '-20 -4 -10'
    },
    real: {
      gpsCameraAttr: 'positionMinAccuracy: 50; gpsMinDistance: 2; gpsTimeInterval: 0; simulateLatitude: 0; simulateLongitude: 0; simulateAltitude: 0;',
      modelPosition: '0 0 0'
    },
    labels: { on: 'GPS aus', off: 'GPS ein' }, // Button-Beschriftungen: on = echtes GPS aktiv
    statusVisibleWhenOn: true                   // Statusanzeige nur bei echtem GPS zeigen
  };

  // false = Simulation aktiv, true = echtes GPS aktiv
  let gpsOn = false;

  function getRefs() {
    const cam = document.getElementById('cam');
    const modelEntity = document.getElementById('modelEntity');
    return { cam, modelEntity };
  }

  function rebindPlacesToCamera(camEl) {
    const gpsComp = camEl?.components?.['gps-camera'];
    document.querySelectorAll('[gps-entity-place]').forEach((el)=>{
      const place = el.components && el.components['gps-entity-place'];
      if (place) {
        place._cameraGps = gpsComp || null;
        try { place._updatePosition(); } catch(e) {}
      }
    });
  }

  function applyGPS() {
    const { cam, modelEntity } = getRefs();
    if (!cam || !modelEntity) return;

    // Sicherstellen, dass die Kamera stabile Controls hat (verhindert teils Safari-Bugs)
    try { if (!cam.hasAttribute('look-controls')) cam.setAttribute('look-controls', 'reverseMouseDrag: true'); } catch(e) {}

    // Komponente neu konfigurieren, ohne die Kamera aus dem DOM zu entfernen
    try { cam.removeAttribute('gps-camera'); } catch(e) {}

    if (gpsOn) {
      // ECHTES GPS
      cam.setAttribute('gps-camera', CONFIG.real.gpsCameraAttr);
      modelEntity.setAttribute('position', CONFIG.real.modelPosition);
      if (gpsBtn) gpsBtn.textContent = CONFIG.labels.on;
      if (gpsStatus) gpsStatus.style.display = CONFIG.statusVisibleWhenOn ? 'flex' : 'none';
    } else {
      // SIMULATION
      cam.setAttribute('gps-camera', `simulateLatitude: ${CONFIG.sim.lat}; simulateLongitude: ${CONFIG.sim.lon};`);
      modelEntity.setAttribute('position', CONFIG.sim.modelPosition);
      if (gpsBtn) gpsBtn.textContent = CONFIG.labels.off;
      if (gpsStatus) gpsStatus.style.display = 'none';
    }

    // Places neu an die (evtl. neu initialisierte) Komponente binden
    // kurzer Timeout, damit A-Frame die Komponente initialisieren kann
    setTimeout(() => rebindPlacesToCamera(cam), 0);

    // iOS: Nach Permission-Dialog kann das Video pausieren → wieder anstoßen
    resumeVideoIfPaused();
  }

  // Versucht, ein ggf. pausiertes AR.js-Video wieder zum Laufen zu bringen (iOS/Android)
  function resumeVideoIfPaused() {
    const v = document.querySelector('video');
    if (!v) return;
    try {
      v.setAttribute('playsinline','');
      v.setAttribute('webkit-playsinline','');
      v.muted = true;
      v.autoplay = true;
    } catch(e) {}
    try {
      if (v.paused) {
        const p = v.play();
        if (p && typeof p.catch === 'function') p.catch(()=>{});
      }
      // Zusätzlich sicherstellen, dass Track aktiv ist
      const stream = v.srcObject;
      if (stream && stream.getVideoTracks) {
        stream.getVideoTracks().forEach(tr => { if (tr && tr.enabled === false) tr.enabled = true; });
      }
    } catch(e) {}
  }

  // Verdrahtet das Video mit Keep-Alive-Events, damit es nach Störungen neu anläuft
  function setupVideoKeepAlive(v){
    if (!v || v.__keepAliveSetup) return;
    v.__keepAliveSetup = true;
    try {
      v.setAttribute('playsinline','');
      v.setAttribute('webkit-playsinline','');
      v.muted = true;
      v.autoplay = true;
    } catch(e) {}
    const tryPlay = () => setTimeout(resumeVideoIfPaused, 50);
    ['pause','stalled','suspend','waiting','emptied','abort','ended'].forEach(ev=>v.addEventListener(ev, tryPlay));
    ['loadeddata','canplay','playing'].forEach(ev=>v.addEventListener(ev, ()=>{}, { once:false }));
  }

  // Erst initialisieren, wenn die Szene fertig ist (Komponenten sind dann bereit)
  const onSceneReady = () => {
    applyGPS();
    // Video Keep-Alive einrichten (falls Video bereits da ist)
    const v0 = document.querySelector('video');
    if (v0) setupVideoKeepAlive(v0);
    // Beobachte spätere Video-Anfügungen
    const mo = new MutationObserver(ms=>{
      for (const m of ms) {
        for (const n of m.addedNodes) {
          if (n && n.nodeName === 'VIDEO') setupVideoKeepAlive(n);
        }
      }
    });
    try { mo.observe(document.body, { childList:true, subtree:true }); } catch(e) {}

    gpsBtn?.addEventListener('click', () => {
      // direkt umschalten, Berechtigungsdialog wird vom Browser/AR.js bei Bedarf angezeigt
      gpsOn = !gpsOn;
      applyGPS();
      // Falls Safari/iOS durch Dialog oder Orientierungswechsel pausiert hat
      setTimeout(resumeVideoIfPaused, 300);
    });

    // Zusätzliche Sicherheitsnetze für iOS
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) setTimeout(resumeVideoIfPaused, 200);
    });
    window.addEventListener('orientationchange', () => setTimeout(resumeVideoIfPaused, 300));
  };

  if (scene && scene.hasLoaded) {
    onSceneReady();
  } else if (scene) {
    scene.addEventListener('loaded', onSceneReady, { once: true });
  } else {
    // Fallback, falls embedded Szene noch nicht greifbar wäre
    window.addEventListener('DOMContentLoaded', onSceneReady, { once: true });
  }

  // ------- GPS-Statusbox unter dem Header positionieren -------
  let gpsBoxOffset = 10; // px Abstand
  function positionGpsStatus() {
    const header = document.querySelector('header');
    const box = document.getElementById('gps-status');
    if (header && box) {
      const rect = header.getBoundingClientRect();
      box.style.top = (rect.bottom + gpsBoxOffset) + 'px';
    }
  }
  window.addEventListener('resize', positionGpsStatus);
  window.addEventListener('DOMContentLoaded', positionGpsStatus);

  // Hinweis: keine manuelle Geopermission mehr – Browser/AR.js regeln den Dialog automatisch

  // --------- Live-Status (Genauigkeit) ---------
  window.addEventListener('gps-camera-update-position', (e) => {
    const acc = e?.detail?.position?.accuracy;
    const txt = document.querySelector('#gps-status .gps-status-text');
    if (!txt) return;
    if (gpsOn) {
      if (typeof acc === 'number') {
        txt.textContent = `GPS aktiv • ±${Math.round(acc)} m`;
      } else {
        txt.textContent = 'GPS aktiv';
      }
    }
  });

})();
