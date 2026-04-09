/**
 * Pulse Log — Client-side animations & interactions.
 * Handles GSAP entrance, idle pulse runners, hover/click, and legend isolation.
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';

gsap.registerPlugin(ScrollTrigger, MotionPathPlugin);

// ── Types ────────────────────────────────────────────────────────────────────

interface PulseDay {
  date: string;
  total: number;
  peakHour: string;
  summary: string;
  dominantCategory: string;
  tools: {
    tool: string;
    context: string;
    interactions: number;
    confidence: string;
    topPromptTypes: string[];
    topCategory: string;
  }[];
}

interface ChannelInfo {
  id: string;
  label: string;
  color: string;
  context: string;
}

// ── Data ─────────────────────────────────────────────────────────────────────

function loadData(): { pulses: PulseDay[]; channels: ChannelInfo[] } {
  const dataEl = document.getElementById('pulse-data');
  const chEl = document.getElementById('pulse-channels');
  return {
    pulses: dataEl ? (JSON.parse(dataEl.textContent ?? '[]') as PulseDay[]) : [],
    channels: chEl ? (JSON.parse(chEl.textContent ?? '[]') as ChannelInfo[]) : [],
  };
}

// ── State ─────────────────────────────────────────────────────────────────────

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let activeContext: 'all' | 'personal' | 'work' = 'all';
let lockedTool: string | null = null;
let selectedDayIndex: number | null = null;
let pulseRunnerTweens: gsap.core.Tween[] = [];

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const section = document.querySelector<HTMLElement>('.pulse-log');
  if (!section) return;

  const { pulses, channels } = loadData();
  if (pulses.length === 0 || channels.length === 0) return;

  if (prefersReducedMotion) {
    showWithoutAnimation(section);
  } else {
    initEntrance(section);
  }

  initHover(section, pulses);
  initLegend(section, channels);
  initFilterButtons(section);
  initDetailPanel(section, pulses, channels);
  if (!prefersReducedMotion) initPulseRunners(section, channels);
});

// ── Functions ─────────────────────────────────────────────────────────────────

/** Skip animation, show everything immediately. */
function showWithoutAnimation(section: HTMLElement): void {
  gsap.set([
    section.querySelector('.pulse-log__overline'),
    section.querySelector('.pulse-log__title'),
    section.querySelector('.pulse-log__subtitle'),
    section.querySelector('.pulse-log__status'),
    section.querySelector('.pulse-log__field'),
    section.querySelector('.pulse-log__legend'),
    section.querySelector('.pulse-log__insights'),
  ], { opacity: 1, y: 0 });

  // Reveal all strokes immediately
  section.querySelectorAll<SVGPathElement>('.pulse-wave-stroke').forEach((p) => {
    p.style.opacity = '0.7';
    p.style.strokeDashoffset = '0';
  });
  section.querySelectorAll<SVGPathElement>('.pulse-wave-fill').forEach((p) => {
    p.style.fillOpacity = '0.08';
  });
}

/** Animated entrance using GSAP ScrollTrigger. */
function initEntrance(section: HTMLElement): void {
  const header = section.querySelector('.pulse-log__header');
  const overline = section.querySelector('.pulse-log__overline');
  const title = section.querySelector('.pulse-log__title');
  const subtitle = section.querySelector('.pulse-log__subtitle');
  const status = section.querySelector('.pulse-log__status');
  const field = section.querySelector('.pulse-log__field');
  const legend = section.querySelector('.pulse-log__legend');
  const insights = section.querySelector('.pulse-log__insights');

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      start: 'top 78%',
      once: true,
    },
  });

  // Header stagger
  tl.to([overline, title, subtitle], {
    opacity: 1,
    y: 0,
    duration: 0.7,
    ease: 'power3.out',
    stagger: 0.12,
  });

  // Status strip
  tl.to(status, { opacity: 1, y: 0, duration: 0.55, ease: 'power3.out' }, '-=0.3');

  // Field container fade
  tl.to(field, { opacity: 1, duration: 0.4, ease: 'power2.out' }, '-=0.2');

  // Draw wave strokes with strokeDashoffset technique
  const strokes = section.querySelectorAll<SVGPathElement>('.pulse-wave-stroke');
  strokes.forEach((path, i) => {
    const len = path.getTotalLength?.() ?? 2000;
    gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
    tl.to(path, {
      strokeDashoffset: 0,
      duration: 1.4,
      ease: 'power2.inOut',
    }, `-=1.1`);
  });

  // Fade fills
  const fills = section.querySelectorAll<SVGPathElement>('.pulse-wave-fill');
  tl.to(fills, { fillOpacity: 0.08, duration: 0.8, ease: 'power2.out' }, '-=1.0');

  // Legend, insights
  tl.to(legend, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' }, '-=0.3');
  tl.to(insights, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' }, '-=0.2');
}

/** Create and animate pulse runners (glowing dots per channel). */
function initPulseRunners(section: HTMLElement, channels: ChannelInfo[]): void {
  const runnersGroup = section.querySelector<SVGGElement>('.pulse-runners');
  if (!runnersGroup) return;

  // Clear previous
  pulseRunnerTweens.forEach((t) => t.kill());
  pulseRunnerTweens = [];
  runnersGroup.innerHTML = '';

  channels.forEach((ch, i) => {
    const strokePath = section.querySelector<SVGPathElement>(
      `.pulse-wave-stroke--${ch.id}`,
    );
    if (!strokePath) return;

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', '3');
    circle.setAttribute('fill', ch.color);
    circle.setAttribute('opacity', '0.85');
    circle.style.filter = `drop-shadow(0 0 4px ${ch.color})`;
    runnersGroup.appendChild(circle);

    const duration = 7 + i * 1.3; // staggered durations
    const delay = i * 1.1;

    const tween = gsap.to(circle, {
      motionPath: {
        path: strokePath,
        align: strokePath,
        autoRotate: false,
      },
      duration,
      ease: 'none',
      repeat: -1,
      delay,
    });
    pulseRunnerTweens.push(tween);
  });
}

/** Day hover: highlight column + show tooltip. */
function initHover(section: HTMLElement, pulses: PulseDay[]): void {
  const tooltip = section.querySelector<HTMLElement>('.pulse-tooltip');
  const highlight = section.querySelector<SVGRectElement>('.pulse-day-highlight');
  const dayCols = section.querySelectorAll<SVGRectElement>('.pulse-day-col');
  const svgEl = section.querySelector<SVGSVGElement>('.pulse-field__svg');

  if (!tooltip || !highlight || !svgEl) return;

  const SVG_W = 1200;
  const dayStep = SVG_W / (pulses.length - 1);

  function showDay(col: SVGRectElement): void {
    const i = parseInt(col.dataset.index ?? '0', 10);
    const day = pulses[i];
    if (!day) return;

    // Move highlight beam
    const colX = i * dayStep - dayStep / 2;
    gsap.to(highlight, {
      attr: { x: Math.max(0, colX) },
      duration: 0.12,
      ease: 'power2.out',
    });
    gsap.to(highlight, { opacity: 1, duration: 0.15 });

    // Populate tooltip
    const dateStr = new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    tooltip.querySelector('.pulse-tooltip__date')!.textContent = dateStr;
    tooltip.querySelector('.pulse-tooltip__total')!.textContent = String(day.total);
    tooltip.querySelector('.pulse-tooltip__summary')!.textContent = day.summary;
    tooltip.querySelector('.pulse-tooltip__peak')!.textContent = day.peakHour;

    // Position tooltip horizontally
    const pct = i / (pulses.length - 1);
    const clampedLeft = Math.max(10, Math.min(90, pct * 100));
    Object.assign(tooltip.style, { left: `${clampedLeft}%`, opacity: '1' });
    tooltip.classList.add('pulse-tooltip--visible');
  }

  function hideDay(): void {
    gsap.to(highlight, { opacity: 0, duration: 0.2 });
    tooltip.classList.remove('pulse-tooltip--visible');
    tooltip.style.opacity = '0';
  }

  dayCols.forEach((col) => {
    col.addEventListener('mouseenter', () => showDay(col));
    col.addEventListener('mouseleave', hideDay);
    col.addEventListener('focus', () => showDay(col));
    col.addEventListener('blur', hideDay);
    col.addEventListener('click', () => {
      const i = parseInt(col.dataset.index ?? '0', 10);
      if (selectedDayIndex === i) {
        closeDetailPanel(section);
      } else {
        openDetailPanel(section, pulses, i);
      }
    });
    col.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        col.click();
      }
    });
  });
}

/** Open day detail panel with tool cards. */
function openDetailPanel(
  section: HTMLElement,
  pulses: PulseDay[],
  index: number,
): void {
  const panel = section.querySelector<HTMLElement>('#pulse-detail');
  if (!panel) return;

  selectedDayIndex = index;
  const day = pulses[index];
  if (!day) return;

  // Populate header
  const dateStr = new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  panel.querySelector<HTMLElement>('.pulse-detail__date')!.textContent = dateStr;
  panel.querySelector<HTMLElement>('.pulse-detail__summary')!.textContent = day.summary;

  // Stats
  panel.querySelector<HTMLElement>('[data-key="total"]')!.textContent =
    `${day.total} interactions`;
  panel.querySelector<HTMLElement>('[data-key="peak"]')!.textContent = day.peakHour;
  panel.querySelector<HTMLElement>('[data-key="category"]')!.textContent =
    day.dominantCategory;

  // Tool cards
  const toolsEl = panel.querySelector<HTMLElement>('.pulse-detail__tools')!;
  toolsEl.innerHTML = '';
  day.tools.forEach((t, i) => {
    const card = buildToolCard(t);
    toolsEl.appendChild(card);
    setTimeout(() => card.classList.add('pulse-tool-card--visible'), 60 * i);
  });

  // Open panel
  panel.setAttribute('aria-expanded', 'true');
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeDetailPanel(section: HTMLElement): void {
  const panel = section.querySelector<HTMLElement>('#pulse-detail');
  if (!panel) return;
  selectedDayIndex = null;
  panel.setAttribute('aria-expanded', 'false');
}

function buildToolCard(
  t: PulseDay['tools'][number],
): HTMLElement {
  const TOOL_LABELS: Record<string, string> = {
    claude: 'Claude',
    'copilot-personal': 'Copilot Personal',
    chatgpt: 'ChatGPT',
    'copilot-work': 'Copilot Work',
    devin: 'Devin',
    'm365-copilot': 'M365 Copilot',
  };
  const TOOL_COLORS: Record<string, string> = {
    claude: '#CC785C',
    'copilot-personal': '#C9A87C',
    chatgpt: '#7CA87C',
    'copilot-work': '#A68F6E',
    devin: '#7C8EC9',
    'm365-copilot': '#9C7CC9',
  };

  const color = TOOL_COLORS[t.tool] ?? 'var(--color-accent)';
  const label = TOOL_LABELS[t.tool] ?? t.tool;

  const card = document.createElement('article');
  card.className = 'pulse-tool-card';
  card.style.borderColor = `${color}26`;
  card.innerHTML = `
    <div class="pulse-tool-card__header">
      <span class="pulse-tool-card__name" style="color:${color}">${label}</span>
      <span class="pulse-tool-card__count" style="color:${color}">${t.interactions}</span>
    </div>
    <span class="pulse-tool-card__category">${t.topCategory}</span>
    <span class="pulse-tool-card__confidence pulse-tool-card__confidence--${t.confidence}">${t.confidence}</span>
  `;
  return card;
}

/** Legend hover: isolate/restore channels. */
function initLegend(section: HTMLElement, channels: ChannelInfo[]): void {
  const items = section.querySelectorAll<HTMLButtonElement>('.pulse-legend-item');

  items.forEach((item) => {
    const toolId = item.dataset.tool ?? '';

    item.addEventListener('mouseenter', () => {
      if (lockedTool) return;
      highlightChannel(section, toolId);
    });

    item.addEventListener('mouseleave', () => {
      if (lockedTool) return;
      restoreChannels(section);
    });

    item.addEventListener('click', () => {
      if (lockedTool === toolId) {
        lockedTool = null;
        item.setAttribute('aria-pressed', 'false');
        restoreChannels(section);
        items.forEach((i) => i.classList.remove('pulse-legend-item--dimmed'));
      } else {
        lockedTool = toolId;
        items.forEach((i) => {
          i.setAttribute('aria-pressed', i.dataset.tool === toolId ? 'true' : 'false');
          i.classList.toggle('pulse-legend-item--dimmed', i.dataset.tool !== toolId);
        });
        highlightChannel(section, toolId);
      }
    });
  });
}

function highlightChannel(section: HTMLElement, toolId: string): void {
  section.querySelectorAll<SVGPathElement>('.pulse-wave-stroke').forEach((p) => {
    p.classList.toggle('pulse-wave-stroke--dimmed', p.dataset.tool !== toolId);
    p.classList.toggle('pulse-wave-stroke--highlighted', p.dataset.tool === toolId);
  });
  section.querySelectorAll<SVGPathElement>('.pulse-wave-fill').forEach((p) => {
    p.classList.toggle('pulse-wave-fill--dimmed', p.dataset.tool !== toolId);
    p.classList.toggle('pulse-wave-fill--highlighted', p.dataset.tool === toolId);
  });
}

function restoreChannels(section: HTMLElement): void {
  section.querySelectorAll<SVGPathElement>('.pulse-wave-stroke').forEach((p) => {
    p.classList.remove('pulse-wave-stroke--dimmed', 'pulse-wave-stroke--highlighted');
  });
  section.querySelectorAll<SVGPathElement>('.pulse-wave-fill').forEach((p) => {
    p.classList.remove('pulse-wave-fill--dimmed', 'pulse-wave-fill--highlighted');
  });
}

/** Context filter: show/hide channels by personal/work. */
function initFilterButtons(section: HTMLElement): void {
  const buttons = section.querySelectorAll<HTMLButtonElement>('.pulse-filter-btn');

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const ctx = (btn.dataset.context ?? 'all') as 'all' | 'personal' | 'work';
      activeContext = ctx;

      buttons.forEach((b) => {
        const isActive = b.dataset.context === ctx;
        b.classList.toggle('pulse-filter-btn--active', isActive);
        b.setAttribute('aria-pressed', String(isActive));
      });

      // Filter wave paths
      const allPaths = section.querySelectorAll<SVGPathElement>(
        '.pulse-wave-stroke, .pulse-wave-fill',
      );
      allPaths.forEach((p) => {
        const pathCtx = p.dataset.context ?? 'all';
        const visible = ctx === 'all' || pathCtx === ctx;
        gsap.to(p, { opacity: visible ? (p.classList.contains('pulse-wave-stroke') ? 0.7 : 1) : 0, duration: 0.35 });
      });

      // Filter legend items
      section.querySelectorAll<HTMLButtonElement>('.pulse-legend-item').forEach((item) => {
        const itemCtx = item.dataset.context ?? '';
        const visible = ctx === 'all' || itemCtx === ctx;
        item.style.display = visible ? '' : 'none';
      });
    });
  });
}

// ── Close detail on button click ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('.pulse-detail-close')?.addEventListener('click', () => {
    const section = document.querySelector<HTMLElement>('.pulse-log');
    if (section) closeDetailPanel(section);
  });
});
