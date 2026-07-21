(() => {
  if (!document.body.classList.contains("network-enabled")) {
    return;
  }

  const intro = document.querySelector(".home-page .intro");
  if (!intro) {
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.className = "intro-network";
  canvas.setAttribute("aria-hidden", "true");
  intro.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const desktopQuery = window.matchMedia("(min-width: 860px)");
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  const ACCENT = [122, 35, 26];
  const NODE_MIN = 10;
  const NODE_MAX = 18;
  const LINK_DISTANCE = 160;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let nodes = [];
  let rafId = 0;
  let running = false;
  let lastTime = 0;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function randomVelocity() {
    return (Math.random() - 0.5) * 0.05;
  }

  function createNode() {
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: randomVelocity(),
      vy: randomVelocity(),
      radius: 1.4 + Math.random() * 1.2,
      phase: Math.random() * Math.PI * 2,
    };
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(rect.width, 1);
    height = Math.max(rect.height, 1);
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function resetNodes() {
    const count = clamp(Math.round((width * height) / 42000), NODE_MIN, NODE_MAX);
    nodes = Array.from({ length: count }, createNode);
  }

  function clearCanvas() {
    ctx.clearRect(0, 0, width, height);
  }

  function updateNodes(delta) {
    for (const node of nodes) {
      const drift = delta * 0.0012;
      node.vx += Math.cos(node.phase + lastTime * 0.00012) * drift;
      node.vy += Math.sin(node.phase + lastTime * 0.0001) * drift;
      node.vx = clamp(node.vx, -0.09, 0.09);
      node.vy = clamp(node.vy, -0.09, 0.09);

      node.x += node.vx * delta;
      node.y += node.vy * delta;

      if (node.x <= 0 || node.x >= width) {
        node.vx *= -1;
        node.x = clamp(node.x, 0, width);
      }

      if (node.y <= 0 || node.y >= height) {
        node.vy *= -1;
        node.y = clamp(node.y, 0, height);
      }
    }
  }

  function drawLinks() {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distance = Math.hypot(dx, dy);

        if (distance > LINK_DISTANCE) {
          continue;
        }

        const alpha = Math.pow(1 - distance / LINK_DISTANCE, 1.7) * 0.06;
        ctx.strokeStyle = `rgba(${ACCENT[0]}, ${ACCENT[1]}, ${ACCENT[2]}, ${alpha})`;
        ctx.lineWidth = 0.65;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  function drawNodes() {
    for (const node of nodes) {
      ctx.fillStyle = `rgba(${ACCENT[0]}, ${ACCENT[1]}, ${ACCENT[2]}, 0.09)`;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function render(now) {
    if (!running) {
      return;
    }

    if (!lastTime) {
      lastTime = now;
    }

    const delta = Math.min(now - lastTime, 24);
    lastTime = now;

    clearCanvas();
    updateNodes(delta);
    drawLinks();
    drawNodes();

    rafId = window.requestAnimationFrame(render);
  }

  function stop() {
    running = false;
    lastTime = 0;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    clearCanvas();
  }

  function start() {
    resizeCanvas();
    resetNodes();
    if (running) {
      return;
    }
    running = true;
    rafId = window.requestAnimationFrame(render);
  }

  function sync() {
    if (motionQuery.matches || !desktopQuery.matches) {
      stop();
      return;
    }
    start();
  }

  window.addEventListener("resize", sync, { passive: true });
  if (desktopQuery.addEventListener) {
    desktopQuery.addEventListener("change", sync);
    motionQuery.addEventListener("change", sync);
  } else {
    desktopQuery.addListener(sync);
    motionQuery.addListener(sync);
  }

  sync();
})();
