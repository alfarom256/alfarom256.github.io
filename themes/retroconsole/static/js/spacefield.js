/*
 * spacefield.js — pixel-art deep-space renderer for the retroconsole theme.
 *
 * The entire scene (nebula, spiral galaxies, starfield, meteors) is drawn into
 * a low-resolution offscreen buffer, then upscaled to the viewport with
 * nearest-neighbour sampling — so everything shares one crisp pixel grid. The
 * nebula gets an ordered (Bayer) dither for authentic 8-bit gradient banding.
 *
 * Honors prefers-reduced-motion (static frame) and pauses when the tab hides.
 */
(function () {
  "use strict";

  var canvas = document.getElementById("spacefield");
  if (!canvas) return;
  var ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;

  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- viewport / pixel grid ----------------------------------------------
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var w = 0, h = 0;      // CSS pixels
  var PIXEL = 3;         // size of one "space pixel" block (CSS px)
  var SW = 0, SH = 0;    // low-res scene dimensions

  // low-res scene buffer (everything is drawn here, then blitted upscaled)
  var scene = document.createElement("canvas");
  var sctx = scene.getContext("2d");

  var PAL = {
    deepA: [12, 10, 34],
    deepB: [26, 20, 64],
    cloudViolet: [122, 70, 190],
    cloudTeal: [40, 130, 150],
    cloudMagenta: [190, 60, 140],
    cloudGreen: [60, 150, 110],
    starWarm: "#fff4e0",
    starCool: "#a8d8ff",
    starWhite: "#ffffff",
    starPhosphor: "#c9ffca"
  };

  function rand(a, b) { return Math.random() * (b - a) + a; }
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }

  // ---- nebula (baked once per resize, dithered) ---------------------------
  var nebula = document.createElement("canvas");
  var nctx = nebula.getContext("2d");
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  function buildNebula() {
    nebula.width = SW;
    nebula.height = SH;
    var g = nctx.createLinearGradient(0, 0, SW * 0.4, SH);
    g.addColorStop(0, rgba(PAL.deepA, 1));
    g.addColorStop(1, rgba(PAL.deepB, 1));
    nctx.fillStyle = g;
    nctx.fillRect(0, 0, SW, SH);

    nctx.globalCompositeOperation = "lighter";
    var clouds = [
      { c: PAL.cloudViolet, n: 5, r: [0.28, 0.5], a: 0.10 },
      { c: PAL.cloudTeal, n: 4, r: [0.22, 0.42], a: 0.08 },
      { c: PAL.cloudMagenta, n: 3, r: [0.18, 0.34], a: 0.07 },
      { c: PAL.cloudGreen, n: 3, r: [0.16, 0.30], a: 0.05 }
    ];
    var diag = Math.max(SW, SH);
    for (var k = 0; k < clouds.length; k++) {
      var cl = clouds[k];
      for (var i = 0; i < cl.n; i++) {
        var cx = rand(-0.1, 1.1) * SW, cy = rand(-0.05, 1.05) * SH;
        var rr = rand(cl.r[0], cl.r[1]) * diag;
        var rg = nctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
        rg.addColorStop(0, rgba(cl.c, cl.a));
        rg.addColorStop(0.5, rgba(cl.c, cl.a * 0.4));
        rg.addColorStop(1, rgba(cl.c, 0));
        nctx.fillStyle = rg;
        nctx.fillRect(0, 0, SW, SH);
      }
    }
    // diagonal dust band
    nctx.save();
    nctx.translate(SW * 0.5, SH * 0.5);
    nctx.rotate(-0.5);
    var band = nctx.createLinearGradient(0, -SH * 0.16, 0, SH * 0.16);
    band.addColorStop(0, rgba(PAL.cloudViolet, 0));
    band.addColorStop(0.5, rgba([180, 170, 210], 0.08));
    band.addColorStop(1, rgba(PAL.cloudTeal, 0));
    nctx.fillStyle = band;
    nctx.fillRect(-diag, -SH * 0.16, diag * 2, SH * 0.32);
    nctx.restore();
    nctx.globalCompositeOperation = "source-over";

    ditherNebula();
  }

  // ordered dither + colour quantization → chunky retro bands
  function ditherNebula() {
    var img, d;
    try { img = nctx.getImageData(0, 0, SW, SH); } catch (e) { return; }
    d = img.data;
    var levels = 10, step = 255 / (levels - 1), amt = 0.45;
    for (var y = 0; y < SH; y++) {
      for (var x = 0; x < SW; x++) {
        var thr = (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * step * amt;
        var idx = (y * SW + x) * 4;
        for (var c = 0; c < 3; c++) {
          var v = Math.round((d[idx + c] + thr) / step) * step;
          d[idx + c] = v < 0 ? 0 : v > 255 ? 255 : v;
        }
      }
    }
    nctx.putImageData(img, 0, 0);
  }

  // ---- spiral galaxies (low-res sprites) ----------------------------------
  function makeGalaxy(size, opts) {
    var spr = document.createElement("canvas");
    spr.width = spr.height = size;
    var g = spr.getContext("2d");
    g.imageSmoothingEnabled = false;
    var cx = size / 2, cy = size / 2, maxR = size * 0.46;
    g.globalCompositeOperation = "lighter";

    var core = g.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.5);
    core.addColorStop(0, "rgba(255,250,235,0.95)");
    core.addColorStop(0.25, rgba(opts.core, 0.6));
    core.addColorStop(1, rgba(opts.core, 0));
    g.fillStyle = core;
    g.fillRect(0, 0, size, size);

    var arms = opts.arms || 2, turns = opts.turns || 2.4, count = opts.count || 500;
    for (var i = 0; i < count; i++) {
      var t = i / count;
      var arm = (i % arms) * (Math.PI * 2 / arms);
      var theta = t * turns * Math.PI * 2 + arm;
      var r = Math.pow(t, 0.62) * maxR;
      var spread = (1 - t) * 0.18 + 0.04;
      theta += rand(-spread, spread);
      r += rand(-1, 1) * maxR * 0.03;
      var x = Math.round(cx + Math.cos(theta) * r);
      var y = Math.round(cy + Math.sin(theta) * r * opts.flatten);
      var col = t < 0.4 ? PAL.starWhite : (Math.random() < 0.6 ? rgba(opts.arm, 1) : PAL.starCool);
      var sz = t < 0.3 ? 2 : 1;                 // whole-pixel blocks
      g.globalAlpha = (1 - t) * 0.8 + 0.15;
      g.fillStyle = col;
      g.fillRect(x, y, sz, sz);
    }
    g.globalAlpha = 1;
    return spr;
  }

  var galaxies = [];
  function buildGalaxies() {
    galaxies = [];
    if (Math.min(w, h) < 520) return;
    var base = Math.min(SW, SH);
    // A — large, loose 2-arm grand-design spiral, gently inclined (violet/teal)
    galaxies.push({
      spr: makeGalaxy(Math.round(base * 0.52), {
        core: PAL.cloudViolet, arm: PAL.cloudTeal, arms: 2, turns: 2.6, count: 560, flatten: 0.66
      }),
      x: SW * 0.80, y: SH * 0.22, rot: 0.3, spin: 0.00003, depth: 0.020
    });
    // B — smaller, tight 4-arm spiral seen nearly edge-on (magenta/violet)
    galaxies.push({
      spr: makeGalaxy(Math.round(base * 0.32), {
        core: PAL.cloudMagenta, arm: PAL.cloudViolet, arms: 4, turns: 3.4, count: 300, flatten: 0.38
      }),
      x: SW * 0.15, y: SH * 0.74, rot: -0.6, spin: -0.000038, depth: 0.034
    });
  }

  // ---- starfield (parallax layers, whole-pixel blocks) --------------------
  var layers = [];
  function buildStars() {
    var area = SW * SH;
    var defs = [
      { density: 0.0022, depth: 0.006, size: 1, twinkle: 0.25 }, // far
      { density: 0.0011, depth: 0.016, size: 1, twinkle: 0.55 }, // mid
      { density: 0.0004, depth: 0.032, size: 2, twinkle: 0.85 }  // near
    ];
    layers = defs.map(function (d) {
      var n = Math.max(30, Math.round(area * d.density));
      var stars = new Array(n);
      for (var i = 0; i < n; i++) {
        var roll = Math.random();
        var color = roll < 0.55 ? PAL.starWhite
          : roll < 0.78 ? PAL.starCool
            : roll < 0.92 ? PAL.starWarm : PAL.starPhosphor;
        stars[i] = {
          u: Math.random(), v: Math.random(), size: d.size, color: color,
          base: rand(0.45, 1),
          amp: Math.random() < 0.6 ? rand(0.15, d.twinkle) : 0,
          phase: rand(0, Math.PI * 2), speed: rand(0.6, 2.2)
        };
      }
      return { def: d, stars: stars };
    });
  }

  // ---- meteors ------------------------------------------------------------
  var meteors = [];
  function spawnMeteor() {
    var ang = rand(Math.PI * 0.12, Math.PI * 0.32), speed = rand(0.5, 0.95);
    meteors.push({
      u: rand(-0.1, 0.9), v: rand(-0.05, 0.5),
      vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      len: rand(0.06, 0.16), life: 0, maxLife: rand(60, 120),
      hue: Math.random() < 0.5 ? "#ffe66d" : "#c9ffca"
    });
  }
  function drawMeteor(m) {
    var sx = m.u * SW, sy = m.v * SH;
    var tx = sx - m.vx * m.len * SW, ty = sy - m.vy * m.len * SH;
    var fade = 1 - m.life / m.maxLife;
    var grad = sctx.createLinearGradient(sx, sy, tx, ty);
    grad.addColorStop(0, "rgba(255,255,255," + (0.95 * fade) + ")");
    grad.addColorStop(0.35, m.hue);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    sctx.strokeStyle = grad;
    sctx.lineWidth = 1;
    sctx.beginPath(); sctx.moveTo(sx, sy); sctx.lineTo(tx, ty); sctx.stroke();
    sctx.fillStyle = "rgba(255,255,255," + (0.95 * fade) + ")";
    sctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
  }

  // ---- ISS (occasional slow flyby) ---------------------------------------
  function makeISS() {
    var W = 46, H = 20, cy = 10;
    var s = document.createElement("canvas");
    s.width = W; s.height = H;
    var g = s.getContext("2d");
    g.imageSmoothingEnabled = false;
    // main truss
    g.fillStyle = "#aab4c4"; g.fillRect(3, cy - 1, W - 6, 2);
    g.fillStyle = "#66707f"; g.fillRect(3, cy + 1, W - 6, 1);
    // four solar-array wings
    function panel(x) {
      var pw = 7, ph = 15, py = cy - 7;
      g.fillStyle = "#26497f"; g.fillRect(x, py, pw, ph);
      g.fillStyle = "#3a62a0"; g.fillRect(x, py, pw, 1);        // top highlight
      g.fillStyle = "#16294c";
      for (var gx = x + 2; gx < x + pw; gx += 2) g.fillRect(gx, py, 1, ph);
      for (var gy = py + 2; gy < py + ph; gy += 3) g.fillRect(x, gy, pw, 1);
      g.fillStyle = "#8a94a4"; g.fillRect(x + 3, cy - 1, 1, 2); // mast to truss
    }
    panel(2); panel(11); panel(29); panel(38);
    // central modules
    g.fillStyle = "#c8d0dc"; g.fillRect(20, cy - 2, 6, 5);
    g.fillStyle = "#9aa4b4"; g.fillRect(22, cy - 4, 3, 9);
    g.fillStyle = "#eef2f8"; g.fillRect(21, cy - 1, 2, 2);      // glint
    return s;
  }
  var issSprite = makeISS();
  var iss = null, issCooldown = 240;

  function spawnISS() {
    var dir = Math.random() < 0.5 ? 1 : -1;
    iss = {
      x: dir > 0 ? -issSprite.width - 6 : SW + issSprite.width + 6,
      y: rand(0.1, 0.55) * SH,
      vx: dir * rand(0.14, 0.24),   // px/frame @ ~60fps → ~100s crossing
      drift: rand(-0.01, 0.01),
      tilt: rand(-0.12, 0.12)
    };
  }
  function updateISS() {
    if (iss) {
      iss.x += iss.vx;
      iss.y += iss.drift;
      var margin = issSprite.width + 10;
      if (iss.x < -margin || iss.x > SW + margin) {
        iss = null;
        issCooldown = 1200 + Math.floor(Math.random() * 2400); // 20–60s gap
      }
    } else if (--issCooldown <= 0) {
      spawnISS();
    }
  }
  function drawISS() {
    if (!iss) return;
    sctx.save();
    sctx.imageSmoothingEnabled = false;
    sctx.translate(Math.round(iss.x), Math.round(iss.y));
    sctx.rotate(iss.tilt);
    sctx.globalAlpha = 0.85;
    sctx.drawImage(issSprite, -(issSprite.width >> 1), -(issSprite.height >> 1));
    sctx.restore();
    sctx.globalAlpha = 1;
  }

  // ---- pointer parallax ---------------------------------------------------
  var ppx = 0, ppy = 0, tpx = 0, tpy = 0;
  window.addEventListener("pointermove", function (e) {
    tpx = (e.clientX / window.innerWidth - 0.5) * 2;
    tpy = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  // ---- scene draw (into low-res buffer) -----------------------------------
  function drawStars(offx, offy, t) {
    for (var l = 0; l < layers.length; l++) {
      var d = layers[l].def, arr = layers[l].stars;
      var dx = offx * d.depth * SW, dy = offy * d.depth * SH;
      for (var i = 0; i < arr.length; i++) {
        var s = arr[i];
        var x = (((s.u * SW + dx) % SW) + SW) % SW;
        var y = (((s.v * SH + dy) % SH) + SH) % SH;
        var a = s.amp ? s.base + s.amp * Math.sin(t * s.speed + s.phase) : s.base;
        if (a < 0.06) continue;
        a = Math.round(Math.min(a, 1) * 4) / 4;   // quantized twinkle steps
        sctx.globalAlpha = a;
        sctx.fillStyle = s.color;
        sctx.fillRect(x | 0, y | 0, s.size, s.size);
      }
    }
    sctx.globalAlpha = 1;
  }

  function drawGalaxies(offx, offy, t) {
    sctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < galaxies.length; i++) {
      var gx = galaxies[i];
      var ang = gx.rot + (reduceMotion ? 0 : t * 1000 * gx.spin);
      var x = gx.x + offx * gx.depth * SW, y = gx.y + offy * gx.depth * SH;
      sctx.save();
      sctx.translate(x, y);
      sctx.rotate(ang);
      sctx.globalAlpha = 0.9;
      sctx.drawImage(gx.spr, -gx.spr.width / 2, -gx.spr.height / 2);
      sctx.restore();
    }
    sctx.globalAlpha = 1;
    sctx.globalCompositeOperation = "source-over";
  }

  function render(t) {
    ppx += (tpx - ppx) * 0.04;
    ppy += (tpy - ppy) * 0.04;
    var offx = ppx + (reduceMotion ? 0 : Math.sin(t * 0.03) * 0.6);
    var offy = ppy + (reduceMotion ? 0 : Math.cos(t * 0.021) * 0.4);

    // --- compose scene at low resolution ---
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.imageSmoothingEnabled = false;
    sctx.fillStyle = rgba(PAL.deepA, 1);
    sctx.fillRect(0, 0, SW, SH);
    sctx.drawImage(nebula, 0, 0); // pinned — parallax on this full-screen layer exposed edge gaps
    drawGalaxies(offx, offy, t);
    drawStars(offx, offy, t);
    if (!reduceMotion) {
      updateISS();
      drawISS();
      if (Math.random() < 0.0028) spawnMeteor();
      for (var i = meteors.length - 1; i >= 0; i--) {
        var m = meteors[i];
        m.u += m.vx / 60; m.v += m.vy / 60; m.life++;
        drawMeteor(m);
        if (m.life > m.maxLife || m.u > 1.2 || m.v > 1.2) meteors.splice(i, 1);
      }
    }

    // --- blit upscaled, nearest-neighbour ---
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(scene, 0, 0, SW, SH, 0, 0, w, h);
  }

  // ---- loop / lifecycle ---------------------------------------------------
  var raf = 0, running = false, start = 0;
  function loop(now) {
    if (!running) return;
    if (!start) start = now;
    render((now - start) / 1000);
    raf = requestAnimationFrame(loop);
  }
  function play() { if (!running) { running = true; raf = requestAnimationFrame(loop); } }
  function stop() { running = false; cancelAnimationFrame(raf); }

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    PIXEL = Math.max(2, Math.round(Math.min(w, h) / 480));
    SW = Math.ceil(w / PIXEL);
    SH = Math.ceil(h / PIXEL);
    canvas.width = Math.round(w * DPR);
    canvas.height = Math.round(h * DPR);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    scene.width = SW;
    scene.height = SH;
    buildNebula();
    buildGalaxies();
    buildStars();
    if (reduceMotion) render(0);
  }

  window.addEventListener("resize", (function () {
    var tmr;
    return function () { clearTimeout(tmr); tmr = setTimeout(resize, 150); };
  })());

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop(); else if (!reduceMotion) play();
  });

  resize();
  if (reduceMotion) render(0); else play();
})();
