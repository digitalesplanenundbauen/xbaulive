// xbaulive/js/gps-toggle.js
// GPS Toggle, Statusanzeige und Hintergrund-Transparenz für AR.js/A-Frame

(function(){
  // ------- GPS Toggle: Simulation ↔ echtes GPS -------
  const scene = document.querySelector('a-scene');
  const gpsBtn = document.getElementById('gpsBtn');
  const gpsStatus = document.getElementById('gps-status');

  // Zielzustände:
  // - Simulation: Kamera mit simulateLatitude/Longitude, Modell leicht versetzt
  // - Echt-GPS:   Kamera mit realem watchPosition, Modell bei 0 0 0

  const SIM_LAT = 47.866880722;
  const SIM_LON = 12.109128178;

  let gpsOn = false; // start: Simulation AUS (also Simulation aktiv)

  function getRefs() {
    const cam = document.getElementById('cam');
    const modelEntity = document.getElementById('modelEntity');
    return { cam, modelEntity };
  }

  // Ersetzt die Kamera vollständig, um den gps-camera Lifecycle garantiert neu zu starten
  function replaceCamera(useRealGps) {
    const sceneEl = document.querySelector('a-scene');
    const oldCam = document.getElementById('cam');
    if (!sceneEl || !oldCam) return null;

    // Alte Kamera entfernen (stoppt ggf. watchPosition)
    try { oldCam.components['gps-camera']?.pause(); } catch(e) {}
    oldCam.parentNode.removeChild(oldCam);

    // Neue Kamera anlegen
    const newCam = document.createElement('a-camera');
    newCam.setAttribute('id', 'cam');
    newCam.setAttribute('rotation-reader', '');

    // look-controls hinzufügen, damit gps-camera init nicht abbricht
    newCam.setAttribute('look-controls', 'reverseMouseDrag: true');
    if (useRealGps) {
      // Real GPS
      newCam.setAttribute('gps-camera', `positionMinAccuracy: 1500; gpsMinDistance: 2; gpsTimeInterval: 0; simulateLatitude: 0; simulateLongitude: 0; simulateAltitude: 0;`);
    } else {
      // Simulation
      newCam.setAttribute('gps-camera', `simulateLatitude: ${SIM_LAT}; simulateLongitude: ${SIM_LON};`);
    }

    // Neue Kamera an gleicher Stelle im DOM einfügen (unter a-scene)
    sceneEl.appendChild(newCam);
    // Nach Ersatz: Places an neue Kamera binden
    rebindPlacesToCamera(newCam);
    return newCam;
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

    // Komponente sauber neu setzen: zuerst entfernen, dann mit neuen Props hinzufügen
    if (gpsOn) {
      // ECHTES GPS
      const newCam = replaceCamera(true);
      modelEntity.setAttribute('position', '0 0 0');

      gpsBtn.textContent = 'GPS aus';
      if (gpsStatus) gpsStatus.style.display = 'flex';
    } else {
      // SIMULATION
      replaceCamera(false);
      modelEntity.setAttribute('position', '-20 -4 -10');

      gpsBtn.textContent = 'GPS ein';
      if (gpsStatus) gpsStatus.style.display = 'none';
    }
  }

  // Erst initialisieren, wenn die Szene fertig ist (Komponenten sind dann bereit)
  const onSceneReady = () => {
    applyGPS();
    gpsBtn?.addEventListener('click', () => {
      gpsOn = !gpsOn; // direkt umschalten, Berechtigungsdialog wird vom Browser/AR.js bei Bedarf angezeigt
      applyGPS();
    });
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
