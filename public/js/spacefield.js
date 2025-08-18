(function(){
  const canvas = document.getElementById('spacefield');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Viewport
  let w = canvas.width = window.innerWidth;
  let h = canvas.height = window.innerHeight;

  const scaleFor = (W,H) => Math.max(2, Math.min(5, Math.round(Math.min(W,H)/400)));
  let px = scaleFor(w,h);

  // Persistent stars (no regeneration)
  const STAR_DENSITY = 0.003;
  const STAR_COUNT = Math.max(300, Math.round(w*h*STAR_DENSITY));
  const stars = Array.from({length: STAR_COUNT}, () => ({
    u: Math.random(),
    v: Math.random(),
    size: (Math.random() < 0.8 ? 1 : 2),
    cool: Math.random() < 0.6
  }));

  // Meteors (normalized space)
  const meteors = [];
  const meteorSpawnRate = 0.0022; // ~0.13/sec

  function rand(min,max){ return Math.random()*(max-min)+min; }

  function makeGradient(){
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0,   '#0b0d23');
    g.addColorStop(0.3, '#1a1440');
    g.addColorStop(0.6, '#2a1b55');
    g.addColorStop(1,   '#3e2c6d');
    return g;
  }
  let bg = makeGradient();

  function spawnMeteor(){
    const u = Math.random();
    const v = rand(0, 0.8);
    const speed = rand(0.6, 1.2) / Math.min(w,h) * 900; // normalize by viewport
    const angle = rand(Math.PI*0.15, Math.PI*0.35);
    meteors.push({
      u, v,
      vx: Math.cos(angle)*speed,
      vy: Math.sin(angle)*speed,
      life: 0,
      maxLife: rand(80, 140)
    });
  }

  function drawMeteor(m){
    const sx = m.u * w, sy = m.v * h;
    const ex = sx - (m.vx*10) * w/900; // short tail
    const ey = sy - (m.vy*10) * h/900;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1, Math.floor(px*0.8));
    ctx.strokeStyle = '#ffe66d';     // bright yellow tail
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.fillStyle = '#a8d8ff';       // light blue head
    ctx.beginPath(); ctx.arc(sx, sy, Math.max(1, Math.floor(px*0.9)), 0, Math.PI*2); ctx.fill();
  }

  function drawStars(){
    ctx.imageSmoothingEnabled = false;
    for (let i=0;i<stars.length;i++){
      const s = stars[i];
      const x = (s.u * w) | 0;
      const y = (s.v * h) | 0;
      ctx.fillStyle = s.cool ? '#a8d8ff' : '#ffffff';
      ctx.fillRect(x, y, s.size, s.size); // fixed-size pixel stars
    }
  }

  function frame(){
    // Background
    ctx.fillStyle = bg;
    ctx.fillRect(0,0,w,h);

    // Stars
    drawStars();

    // Meteors
    if (Math.random() < meteorSpawnRate) spawnMeteor();
    for (let i = meteors.length-1; i>=0; i--){
      const m = meteors[i];
      m.u += m.vx/60;
      m.v += m.vy/60;
      m.life++;
      drawMeteor(m);
      if (m.life > m.maxLife || m.u < -0.05 || m.u > 1.05 || m.v > 1.1){
        meteors.splice(i,1);
      }
    }

    requestAnimationFrame(frame);
  }

  function onResize(){
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    px = scaleFor(w,h);  // affects meteor stroke only
    bg = makeGradient(); // recompute gradient extents
  }

  window.addEventListener('resize', onResize);
  frame();
})();
