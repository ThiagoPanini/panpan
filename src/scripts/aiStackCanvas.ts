/**
 * AI Stack canvas animation — Neural synapse field.
 *
 * Clusters of interconnected nodes that pulse in cascading waves.
 * When one node fires, connected neighbors fire after a short delay,
 * creating a "thinking" ripple effect distinct from the Hero's
 * drifting neural network.
 *
 * Performance: same patterns as neuralNetwork.ts —
 * requestAnimationFrame loop, delta-time capping, visibility pause,
 * ResizeObserver, DPR capping, viewport-scaled node count.
 */

const ACCENT_RGB = '201, 168, 124';

// ── Tuning constants ──────────────────────────────────────
const CONNECTION_THRESHOLD = 140;      // px — max distance to draw a connection
const MAX_CONNECTION_OPACITY = 0.06;   // very subtle base line alpha
const BASE_NODE_OPACITY = 0.10;        // resting node fill alpha
const PULSE_NODE_OPACITY = 0.35;       // node alpha when pulsing
const PULSE_RING_OPACITY = 0.10;       // pulse ring alpha at birth
const CASCADE_DELAY = 80;             // ms — delay before neighbor fires
const CASCADE_RADIUS = 160;           // px — how far a pulse can cascade
const CASCADE_CHANCE = 0.35;          // probability each neighbor fires
const CURSOR_BOOST_RADIUS = 200;      // px — cursor influence area
const CURSOR_BOOST = 1.6;             // opacity multiplier near cursor

interface SynapseNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  pulsePhase: number;       // 0–1, 0 = resting
  pulseRadius: number;      // expanding ring radius
  pulseActive: boolean;
  cascadePending: boolean;  // waiting to fire from cascade
  cascadeTime: number;      // when to fire (performance.now timestamp)
}

function createNodes(w: number, h: number, count: number): SynapseNode[] {
  const nodes: SynapseNode[] = [];
  for (let i = 0; i < count; i++) {
    const speed = 0.08 + Math.random() * 0.12;
    const angle = Math.random() * Math.PI * 2;
    nodes.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 1.2 + Math.random() * 1.3,
      pulsePhase: 0,
      pulseRadius: 0,
      pulseActive: false,
      cascadePending: false,
      cascadeTime: 0,
    });
  }
  return nodes;
}

function nodeCount(width: number): number {
  if (width < 480)  return 18;
  if (width < 820)  return 30;
  if (width < 1280) return 50;
  return 65;
}

export function initAIStackCanvas(): void {
  const canvasEl = document.querySelector<HTMLCanvasElement>('.ais-canvas');
  if (!canvasEl) return;
  const canvas: HTMLCanvasElement = canvasEl;

  const ctxEl = canvas.getContext('2d');
  if (!ctxEl) return;
  const ctx: CanvasRenderingContext2D = ctxEl;

  const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
  let width = 0;
  let height = 0;
  let nodes: SynapseNode[] = [];
  let rafId = 0;
  let lastTime = 0;
  let isVisible = false; // IntersectionObserver driven

  // Cursor position in canvas coords
  let cursorX = -9999;
  let cursorY = -9999;

  // ── Sizing ──────────────────────────────────────────────

  function resize(): void {
    // Read the canvas's own CSS-computed size (from position:absolute + inset:0)
    // instead of the section's size to avoid a resize-observer feedback loop.
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    // Do NOT set canvas.style.width/height — let CSS inset:0 control display size.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    nodes = createNodes(width, height, nodeCount(width));
  }

  // ── Cascade trigger ─────────────────────────────────────

  function triggerCascade(origin: SynapseNode, now: number): void {
    for (const n of nodes) {
      if (n === origin || n.pulseActive || n.cascadePending) continue;
      const dx = n.x - origin.x;
      const dy = n.y - origin.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < CASCADE_RADIUS && Math.random() < CASCADE_CHANCE) {
        n.cascadePending = true;
        n.cascadeTime = now + CASCADE_DELAY + Math.random() * CASCADE_DELAY;
      }
    }
  }

  // ── Draw ────────────────────────────────────────────────

  function drawFrame(timestamp: number): void {
    const delta = Math.min((timestamp - lastTime) / 16.67, 3);
    lastTime = timestamp;

    ctx.clearRect(0, 0, width, height);

    const now = performance.now();

    // Update positions & pulse state
    for (const node of nodes) {
      // Movement — very slow drift
      node.x += node.vx * delta;
      node.y += node.vy * delta;

      // Soft bounce
      if (node.x < 0)     { node.x = 0;     node.vx = Math.abs(node.vx); }
      if (node.x > width) { node.x = width;  node.vx = -Math.abs(node.vx); }
      if (node.y < 0)     { node.y = 0;      node.vy = Math.abs(node.vy); }
      if (node.y > height){ node.y = height;  node.vy = -Math.abs(node.vy); }

      // Cascade activation
      if (node.cascadePending && now >= node.cascadeTime) {
        node.cascadePending = false;
        node.pulseActive = true;
        node.pulsePhase = 0;
        node.pulseRadius = 0;
        triggerCascade(node, now);
      }

      // Pulse advance
      if (node.pulseActive) {
        node.pulsePhase += 0.018 * delta;
        node.pulseRadius = node.pulsePhase * 22;
        if (node.pulsePhase >= 1) {
          node.pulsePhase = 0;
          node.pulseRadius = 0;
          node.pulseActive = false;
        }
      }
    }

    // Draw connections
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= CONNECTION_THRESHOLD) continue;

        const t = 1 - dist / CONNECTION_THRESHOLD;

        // Cursor proximity boost
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const cursorDist = Math.hypot(midX - cursorX, midY - cursorY);
        const cursorFactor = cursorDist < CURSOR_BOOST_RADIUS
          ? 1 + (CURSOR_BOOST - 1) * (1 - cursorDist / CURSOR_BOOST_RADIUS)
          : 1;

        // Active pulse boost on connections
        const activeFactor = (a.pulseActive || b.pulseActive) ? 2.5 : 1;

        const alpha = Math.min(
          t * t * MAX_CONNECTION_OPACITY * cursorFactor * activeFactor,
          0.15,
        );

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(${ACCENT_RGB}, ${alpha})`;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }

    // Draw nodes on top
    for (const node of nodes) {
      // Pulse ring
      if (node.pulseActive && node.pulseRadius > 0) {
        const ringAlpha = PULSE_RING_OPACITY * (1 - node.pulsePhase);
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.pulseRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${ACCENT_RGB}, ${ringAlpha})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // Node dot
      const nodeAlpha = node.pulseActive
        ? BASE_NODE_OPACITY + (PULSE_NODE_OPACITY - BASE_NODE_OPACITY) * (1 - node.pulsePhase)
        : BASE_NODE_OPACITY;

      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${ACCENT_RGB}, ${nodeAlpha})`;
      ctx.fill();
    }

    if (isVisible) {
      rafId = requestAnimationFrame(drawFrame);
    }
  }

  // ── Random pulse ignition ───────────────────────────────

  function schedulePulse(): void {
    const delay = 1200 + Math.random() * 2000;
    setTimeout(() => {
      if (!isVisible) { schedulePulse(); return; }
      const candidates = nodes.filter(n => !n.pulseActive && !n.cascadePending);
      if (candidates.length > 0) {
        const target = candidates[Math.floor(Math.random() * candidates.length)];
        target.pulseActive = true;
        target.pulsePhase = 0;
        target.pulseRadius = 0;
        triggerCascade(target, performance.now());
      }
      schedulePulse();
    }, delay);
  }

  // ── Cursor tracking ──────────────────────────────────────

  function onMouseMove(e: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    cursorX = e.clientX - rect.left;
    cursorY = e.clientY - rect.top;
  }

  function onMouseLeave(): void {
    cursorX = -9999;
    cursorY = -9999;
  }

  // ── Visibility pause ─────────────────────────────────────

  function onVisibilityChange(): void {
    if (document.hidden) {
      cancelAnimationFrame(rafId);
    } else if (isVisible) {
      lastTime = performance.now();
      rafId = requestAnimationFrame(drawFrame);
    }
  }

  // ── IntersectionObserver — pause when off-screen ─────────

  const section = canvas.closest<HTMLElement>('#ai-stack');
  if (section) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            isVisible = true;
            lastTime = performance.now();
            rafId = requestAnimationFrame(drawFrame);
          } else {
            isVisible = false;
            cancelAnimationFrame(rafId);
          }
        }
      },
      { threshold: 0 },
    );
    io.observe(section);
  }

  // ── Init ────────────────────────────────────────────────

  resize();

  const ro = new ResizeObserver(() => { resize(); });
  ro.observe(canvas.closest<HTMLElement>('#ai-stack') ?? document.body);

  window.addEventListener('mousemove', onMouseMove, { passive: true });
  window.addEventListener('mouseleave', onMouseLeave);
  document.addEventListener('visibilitychange', onVisibilityChange);

  schedulePulse();

  // Fade canvas in after first frame settles
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      canvas.style.opacity = '1';
    });
  });
}
