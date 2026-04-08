/**
 * Neural network canvas animation.
 *
 * Renders a field of drifting nodes connected by lines when within range.
 * Nodes periodically "fire" with a pulse ring suggesting neural activation.
 * Cursor proximity boosts connection opacity for interactivity.
 *
 * Performance notes:
 * - All drawing uses transform/opacity-equivalent canvas ops (no layout)
 * - Pauses when tab is hidden
 * - Scales node count with screen size
 * - Respects prefers-reduced-motion (caller should check before invoking)
 */

const ACCENT_RGB = '201, 168, 124';

const CONNECTION_THRESHOLD = 180;     // px — max distance to draw a line
const MAX_CONNECTION_OPACITY = 0.1;   // max line alpha
const BASE_NODE_OPACITY = 0.18;       // resting node fill alpha
const PULSE_NODE_OPACITY = 0.45;      // node alpha during active pulse
const PULSE_RING_OPACITY = 0.14;      // pulse ring alpha at start
const CURSOR_BOOST_RADIUS = 220;      // px — cursor influence on connections
const CURSOR_BOOST = 1.9;             // opacity multiplier near cursor

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;           // drawn dot size
  layer: number;            // 0 = far/slow, 1 = near/fast
  pulsePhase: number;       // 0–1, 0 = resting
  pulseRadius: number;      // expanding ring radius
  pulseActive: boolean;
}

function createNodes(width: number, height: number, count: number): Node[] {
  const nodes: Node[] = [];
  for (let i = 0; i < count; i++) {
    const layer = Math.random() < 0.4 ? 0 : 1;
    const speed = layer === 0 ? 0.12 : 0.28;
    const angle = Math.random() * Math.PI * 2;
    nodes.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: Math.cos(angle) * speed * (0.6 + Math.random() * 0.8),
      vy: Math.sin(angle) * speed * (0.6 + Math.random() * 0.8),
      radius: layer === 0 ? 1.5 + Math.random() * 1 : 2 + Math.random() * 1.5,
      layer,
      pulsePhase: 0,
      pulseRadius: 0,
      pulseActive: false,
    });
  }
  return nodes;
}

function nodeCount(width: number): number {
  if (width < 480) return 22;
  if (width < 820) return 35;
  if (width < 1280) return 55;
  return 70;
}

export function initNeuralNetwork(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('.hero-neural-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
  let width = 0;
  let height = 0;
  let nodes: Node[] = [];
  let rafId = 0;
  let lastTime = 0;

  // Cursor position in canvas coords
  let cursorX = -9999;
  let cursorY = -9999;

  // ── Sizing ──────────────────────────────────────────────

  function resize(): void {
    const hero = canvas.closest<HTMLElement>('.hero') ?? document.documentElement;
    const rect = hero.getBoundingClientRect();
    width = rect.width;
    height = rect.height;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    nodes = createNodes(width, height, nodeCount(width));
  }

  // ── Draw ────────────────────────────────────────────────

  function drawFrame(timestamp: number): void {
    const delta = Math.min((timestamp - lastTime) / 16.67, 3); // capped at 3× normal delta
    lastTime = timestamp;

    ctx.clearRect(0, 0, width, height);

    // Update + draw connections first (below nodes)
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];

      // Update position
      a.x += a.vx * delta;
      a.y += a.vy * delta;

      // Soft bounce
      if (a.x < 0)     { a.x = 0;     a.vx = Math.abs(a.vx); }
      if (a.x > width) { a.x = width; a.vx = -Math.abs(a.vx); }
      if (a.y < 0)     { a.y = 0;     a.vy = Math.abs(a.vy); }
      if (a.y > height){ a.y = height; a.vy = -Math.abs(a.vy); }

      // Pulse advance
      if (a.pulseActive) {
        a.pulsePhase += 0.022 * delta;
        a.pulseRadius = a.pulsePhase * 28;
        if (a.pulsePhase >= 1) {
          a.pulsePhase = 0;
          a.pulseRadius = 0;
          a.pulseActive = false;
        }
      }

      // Draw connections to subsequent nodes
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist >= CONNECTION_THRESHOLD) continue;

        const t = 1 - dist / CONNECTION_THRESHOLD;  // 0–1, closer = higher

        // Cursor proximity boost
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const cursorDist = Math.hypot(midX - cursorX, midY - cursorY);
        const cursorFactor = cursorDist < CURSOR_BOOST_RADIUS
          ? 1 + (CURSOR_BOOST - 1) * (1 - cursorDist / CURSOR_BOOST_RADIUS)
          : 1;

        // Active-node boost
        const activeFactor = (a.pulseActive || b.pulseActive) ? 2.2 : 1;

        const alpha = Math.min(
          t * t * MAX_CONNECTION_OPACITY * cursorFactor * activeFactor,
          0.55,
        );

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(${ACCENT_RGB}, ${alpha})`;
        ctx.lineWidth = a.layer === 1 && b.layer === 1 ? 0.85 : 0.5;
        ctx.stroke();
      }
    }

    // Draw nodes on top of connections
    for (const node of nodes) {
      // Pulse ring
      if (node.pulseActive && node.pulseRadius > 0) {
        const ringAlpha = PULSE_RING_OPACITY * (1 - node.pulsePhase);
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.pulseRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${ACCENT_RGB}, ${ringAlpha})`;
        ctx.lineWidth = 1;
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

    rafId = requestAnimationFrame(drawFrame);
  }

  // ── Random pulse trigger ─────────────────────────────────

  function schedulePulse(): void {
    const delay = 600 + Math.random() * 1400;
    setTimeout(() => {
      // Pick a random foreground node
      const candidates = nodes.filter(n => n.layer === 1 && !n.pulseActive);
      if (candidates.length > 0) {
        const target = candidates[Math.floor(Math.random() * candidates.length)];
        target.pulseActive = true;
        target.pulsePhase = 0;
        target.pulseRadius = 0;
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
    } else {
      lastTime = performance.now();
      rafId = requestAnimationFrame(drawFrame);
    }
  }

  // ── Init ────────────────────────────────────────────────

  resize();

  const ro = new ResizeObserver(() => {
    resize();
  });
  ro.observe(canvas.closest<HTMLElement>('.hero') ?? document.body);

  window.addEventListener('mousemove', onMouseMove, { passive: true });
  window.addEventListener('mouseleave', onMouseLeave);
  document.addEventListener('visibilitychange', onVisibilityChange);

  lastTime = performance.now();
  rafId = requestAnimationFrame(drawFrame);
  schedulePulse();

  // Fade canvas in after first frame settles
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      canvas.style.opacity = '1';
    });
  });
}
