/* global THREE */
'use strict';

/**
 * CookingAR
 *
 * Phase 1 (instant):  Label-based placeholder mesh appears immediately.
 * Phase 2 (async):    Crops the bounding box from the photo, calls
 *                     /api/hf/depth (Depth Anything), builds a
 *                     PlaneGeometry displaced by the real depth map and
 *                     textured with the actual crop pixels — an exact
 *                     colour + shape replica of the ingredient.
 *
 * The ingredient mesh is positioned in the 3D scene at the world-space
 * coordinate that matches the bounding box centre in the image.
 */
const CookingAR = (() => {
  let _animId        = null;
  let _renderer      = null;
  let _canvas        = null;
  let _ingredientRef = null; // updated when depth mesh swaps in

  // ── Colour palette ─────────────────────────────────────────────────────────
  const PALETTE = [
    [['tomato','strawberry','cherry','raspberry','pepper'], 0xd32f2f],
    [['apple'],                                              0xc62828],
    [['carrot','pumpkin','sweet potato'],                   0xe65100],
    [['orange'],                                             0xf4511e],
    [['lemon','banana','corn','squash'],                    0xf9a825],
    [['broccoli','spinach','kale','zucchini','cucumber'],   0x2e7d32],
    [['celery','leek','asparagus'],                         0x558b2f],
    [['onion'],                                              0xd4824a],
    [['garlic','ginger'],                                   0xf0e6c8],
    [['potato','mushroom'],                                  0xa1887f],
    [['bread','flour','oat'],                               0xd4a96a],
    [['blueberry','grape','eggplant','plum'],               0x6a3d9a],
    [['beet'],                                               0xad1457],
  ];
  function ingredientColor(label) {
    const n = (label || '').toLowerCase();
    for (const [keys, hex] of PALETTE) if (keys.some(k => n.includes(k))) return hex;
    return 0xd4b896;
  }

  // ── PBR material helper ────────────────────────────────────────────────────
  function pbr(color, rough, metal, cc = 0) {
    return new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: metal, clearcoat: cc, clearcoatRoughness: 0.25 });
  }

  // ── Bbox → world coordinates ───────────────────────────────────────────────
  // Maps normalised image coordinates (0–1) to Three.js world coordinates.
  // Camera: position (0, 1.8, 3.4), lookAt (0, 0.1, 0), FOV 42.
  // Approximate visible range at z=0: x ∈ [-2.4, +2.4], y ∈ [-1.2, +1.2]
  function bboxToWorld(bbox) {
    const cx = (bbox.x || 0) + (bbox.w || 0.5) / 2;
    const cy = (bbox.y || 0) + (bbox.h || 0.5) / 2;
    return {
      x: (cx - 0.5) * 2.6,
      y: -(cy - 0.5) * 1.4,
    };
  }

  // ── Placeholder (instant, label-based) ────────────────────────────────────
  function buildPlaceholder(label) {
    const n     = (label || '').toLowerCase();
    const color = ingredientColor(label);
    const group = new THREE.Group();

    let body;
    if (['garlic','onion','tomato','apple','orange','lemon','lime','peach','plum','egg','cherry','grape','blueberry','strawberry'].some(k => n.includes(k))) {
      body = new THREE.Mesh(new THREE.SphereGeometry(0.44, 40, 28), pbr(color, 0.55, 0, 0.35));
      body.scale.set(1, n.includes('onion') ? 0.85 : n.includes('garlic') ? 0.78 : 0.92, 1);
    } else if (['carrot','cucumber','asparagus','celery','leek','banana','zucchini','beet','corn'].some(k => n.includes(k))) {
      body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.19, 0.84, 18), pbr(color, 0.60, 0, 0.20));
    } else if (['mushroom'].some(k => n.includes(k))) {
      body = new THREE.Mesh(new THREE.SphereGeometry(0.46, 32, 20), pbr(color, 0.78, 0));
      body.scale.set(1, 0.52, 1);
    } else {
      body = new THREE.Mesh(new THREE.SphereGeometry(0.44, 40, 28), pbr(color, 0.65, 0, 0.15));
    }
    body.castShadow = true;
    group.add(body);

    // Small stem on round ingredients
    if (['tomato','apple','orange','lemon','garlic','onion'].some(k => n.includes(k))) {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.028, 0.18, 8), pbr(0x5d4037, 0.88, 0));
      stem.position.y = 0.44;
      group.add(stem);
    }
    return group;
  }

  // ── Depth mesh (Phase 2 — matches actual photo) ───────────────────────────
  // Returns a Promise<THREE.Mesh | null>
  async function buildDepthMesh(imgEl, bbox) {
    // 1. Crop the ingredient from the photo
    const nw = imgEl.naturalWidth, nh = imgEl.naturalHeight;
    if (!nw || !nh) return null;

    const cw = Math.max(32, Math.round((bbox.w || 0.5) * nw));
    const ch = Math.max(32, Math.round((bbox.h || 0.5) * nh));
    const cropCanvas  = document.createElement('canvas');
    cropCanvas.width  = cw;
    cropCanvas.height = ch;
    cropCanvas.getContext('2d').drawImage(
      imgEl,
      (bbox.x || 0) * nw, (bbox.y || 0) * nh,
      (bbox.w || 1)  * nw, (bbox.h || 1) * nh,
      0, 0, cw, ch
    );
    const cropDataUrl = cropCanvas.toDataURL('image/jpeg', 0.90);
    const cropBlob    = await new Promise(r => cropCanvas.toBlob(r, 'image/jpeg', 0.90));
    if (!cropBlob) return null;

    // 2. Ask backend for depth map
    const form = new FormData();
    form.append('crop', cropBlob, 'crop.jpg');
    let depthDataUrl = null;
    try {
      const res  = await fetch('/api/hf/depth', { method: 'POST', body: form, signal: AbortSignal.timeout(30000) });
      if (res.ok) {
        const data = await res.json();
        depthDataUrl = data.depthMap || null;
        console.log('[CookingAR] depth model:', data.model);
      }
    } catch (e) {
      console.log('[CookingAR] depth fetch failed:', e.message);
    }

    // 3. Build the displaced plane
    return new Promise((resolve) => {
      // PlaneGeometry segments: higher = smoother depth, heavier on GPU
      const SEG  = 80;
      const geo  = new THREE.PlaneGeometry(1.1, 1.1, SEG, SEG);

      // Crop texture (actual ingredient colours)
      const cropTex       = new THREE.TextureLoader().load(cropDataUrl);
      cropTex.encoding    = THREE.sRGBEncoding;

      const matParams = {
        map:              cropTex,
        roughness:        0.68,
        metalness:        0.0,
        side:             THREE.FrontSide,
      };

      if (depthDataUrl) {
        // Displacement from real depth map
        const depthTex              = new THREE.TextureLoader().load(depthDataUrl);
        matParams.displacementMap   = depthTex;
        matParams.displacementScale = 0.42;
        matParams.displacementBias  = -0.10;
      }

      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial(matParams));
      mesh.castShadow    = true;
      mesh.receiveShadow = true;
      // Tilt toward camera so depth reads nicely (like ingredient lying on table facing viewer)
      mesh.rotation.x = -Math.PI * 0.28;

      // Give textures a frame to load before resolving
      setTimeout(() => resolve(mesh), 150);
    });
  }

  // ── Chef's knife (ExtrudeGeometry) ────────────────────────────────────────
  function buildKnife() {
    const group = new THREE.Group();

    // Blade profile — realistic chef's knife outline, viewed face-on
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0.002, -0.34);                          // tip
    bladeShape.quadraticCurveTo(0.092, -0.02, 0.10, 0.36);   // curved cutting edge → bolster
    bladeShape.lineTo(-0.004, 0.36);                          // spine top
    bladeShape.quadraticCurveTo(-0.008, 0.04, 0.002, -0.34); // spine curves back to tip

    const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
      depth:            0.009,
      bevelEnabled:     true,
      bevelThickness:   0.0015,
      bevelSize:        0.0012,
      bevelSegments:    2,
    });
    bladeGeo.translate(-0.05, 0, -0.0045); // centre on origin

    const blade = new THREE.Mesh(bladeGeo, pbr(0xeaeaea, 0.04, 0.96, 1.0));
    blade.castShadow = true;
    group.add(blade);

    // Bolster (steel collar)
    const bolster = new THREE.Mesh(
      new THREE.BoxGeometry(0.076, 0.052, 0.052),
      pbr(0xbdbdbd, 0.20, 0.90)
    );
    bolster.position.y = 0.386;
    group.add(bolster);

    // Handle
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.090, 0.30, 0.044),
      pbr(0x2c1a0e, 0.86, 0)
    );
    handle.position.y = 0.537;
    handle.castShadow = true;
    group.add(handle);

    // Handle rivets
    [0.50, 0.575].forEach(y => {
      const rivet = new THREE.Mesh(
        new THREE.CylinderGeometry(0.011, 0.011, 0.048, 10),
        pbr(0x9e9e9e, 0.32, 0.82)
      );
      rivet.rotation.x = Math.PI / 2;
      rivet.position.set(0, y, 0);
      group.add(rivet);
    });

    return group;
  }

  // ── Cutting board ──────────────────────────────────────────────────────────
  function buildBoard() {
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.075, 1.30),
      pbr(0x8d5524, 0.88, 0)
    );
    board.receiveShadow = true;
    // Grain lines
    const grainMat = pbr(0x6d4c41, 0.93, 0);
    [-0.28, -0.08, 0.12, 0.32].forEach(z => {
      const grain = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.001, 0.010), grainMat);
      grain.position.set(0, 0.04, z);
      board.add(grain);
    });
    return board;
  }

  // ── Scene setup ────────────────────────────────────────────────────────────
  function setupScene(wrapperEl) {
    const rect   = wrapperEl.getBoundingClientRect();
    const dpr    = Math.min(window.devicePixelRatio || 1, 2);
    const cw     = Math.round(rect.width  * dpr);
    const ch     = Math.round(rect.height * dpr);
    const aspect = cw / ch || 1;

    const canvas         = document.createElement('canvas');
    canvas.className     = 'ar-canvas';
    canvas.width         = cw;
    canvas.height        = ch;
    canvas.style.cssText = `width:${rect.width}px;height:${rect.height}px;display:block;`;
    wrapperEl.appendChild(canvas);
    _canvas = canvas;

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 100);
    camera.position.set(0, 1.8, 3.4);
    camera.lookAt(0, 0.1, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true });
    renderer.setSize(cw, ch, false);
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x111318, 1); // solid dark bg — no transparency issues
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    _renderer = renderer;

    // 3-point lighting — standard Three.js intensity units (NOT physicallyCorrect)
    scene.add(new THREE.AmbientLight(0x8090b0, 0.9));

    const key = new THREE.DirectionalLight(0xfff0d0, 1.6);
    key.position.set(3, 7, 5);
    key.castShadow           = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near   = 0.5;
    key.shadow.camera.far    = 20;
    key.shadow.camera.left   = -3; key.shadow.camera.right = 3;
    key.shadow.camera.top    = 3;  key.shadow.camera.bottom = -3;
    key.shadow.bias          = -0.0008;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xb0c8ff, 0.55);
    fill.position.set(-4, 2, -2);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.35);
    rim.position.set(0, -2, -5);
    scene.add(rim);

    return { scene, camera, renderer };
  }

  // ── Animation loop ─────────────────────────────────────────────────────────
  // Knife arc: y = baseY + 0.82 + sin(t) * 0.75  →  always in frame
  function startAnimation(renderer, scene, camera, knifePosX, knifePosY) {
    let t = 0, orb = 0;
    function loop() {
      _animId = requestAnimationFrame(loop);
      t   += 0.022;
      orb += 0.003;

      // Gentle camera drift — keeps scene alive
      camera.position.x = Math.sin(orb) * 0.20;
      camera.position.z = 3.4 + Math.cos(orb * 0.7) * 0.12;
      camera.lookAt(0, 0.1, 0);

      // Find the knife in the scene (it was added by mount)
      const knife = scene.getObjectByName('knife');
      if (knife) {
        knife.position.y  = knifePosY + 0.82 + Math.sin(t) * 0.75;
        knife.rotation.z  = Math.sin(t) * 0.06;
      }

      // Ingredient: slow spin + impact squish
      if (_ingredientRef) {
        _ingredientRef.rotation.y    += 0.006;
        _ingredientRef.position.y     = _ingredientRef.userData.baseY - Math.max(0, -Math.sin(t)) * 0.03;
      }

      renderer.render(scene, camera);
    }
    loop();
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  async function mount(wrapperEl, imgEl, detection) {
    unmount();
    if (!window.THREE) { console.error('[CookingAR] THREE not loaded'); _clearBadge(); return; }

    try {
      // Wait for wrapper to have real dimensions
      await new Promise(resolve => {
        const check = () => wrapperEl.getBoundingClientRect().width > 10 ? resolve() : setTimeout(check, 50);
        setTimeout(check, 40);
      });

      const { scene, camera, renderer } = setupScene(wrapperEl);
      const pos = bboxToWorld(detection);
      console.log('[CookingAR] bbox world pos:', pos, '| label:', detection.name);

      // ── Cutting board ──
      const board = buildBoard();
      board.position.set(pos.x, pos.y - 0.64, 0);
      scene.add(board);

      // ── Placeholder ingredient (instant) ──
      const placeholder = buildPlaceholder(detection.name || '');
      placeholder.position.set(pos.x, pos.y, 0);
      placeholder.userData.baseY = pos.y;
      scene.add(placeholder);
      _ingredientRef = placeholder;

      // ── Knife ──
      const knife = buildKnife();
      knife.name = 'knife';
      knife.position.set(pos.x + 0.08, pos.y + 0.82, 0.32);
      scene.add(knife);

      _clearBadge();
      startAnimation(renderer, scene, camera, pos.x + 0.08, pos.y);

      // ── Phase 2: async depth mesh — swaps in when ready ──
      buildDepthMesh(imgEl, detection).then(depthMesh => {
        if (!depthMesh || !_renderer) return; // unmounted while loading
        // Remove placeholder, add real depth mesh
        scene.remove(placeholder);
        placeholder.traverse(c => { if (c.geometry) c.geometry.dispose(); });

        depthMesh.position.set(pos.x, pos.y, 0);
        depthMesh.userData.baseY = pos.y;
        scene.add(depthMesh);
        _ingredientRef = depthMesh;
        console.log('[CookingAR] depth mesh swapped in');
      }).catch(err => {
        console.log('[CookingAR] depth mesh failed, keeping placeholder:', err.message);
      });

    } catch (err) {
      console.error('[CookingAR] mount error:', err);
      _clearBadge();
    }
  }

  function unmount() {
    if (_animId)   { cancelAnimationFrame(_animId); _animId = null; }
    if (_renderer) { _renderer.dispose(); _renderer = null; }
    if (_canvas)   { _canvas.remove(); _canvas = null; }
    _ingredientRef = null;
  }

  function _clearBadge() {
    const b = document.getElementById('ar-loading');
    if (b) b.remove();
  }

  return { mount, unmount };
})();
