/**
 * Hero section entrance animations and interactivity.
 * Uses GSAP for choreographed timeline, parallax, and magnetic CTA.
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Show all elements immediately when reduced motion is preferred. */
function showWithoutAnimation(): void {
  gsap.set('.hero-overline', { clipPath: 'inset(0 0% 0 0)' });
  gsap.set('.hero-name .line-inner', { y: '0%', opacity: 1, filter: 'blur(0px)' });
  gsap.set('.hero-divider', { scaleX: 1 });
  gsap.set('.hero-tagline', { opacity: 1, y: 0 });
  gsap.set('.hero-cta', { opacity: 1, y: 0 });
  gsap.set('.photo-wrapper', { opacity: 1, scale: 1, y: 0 });
  gsap.set('.hero-accent-line', { height: '55%' });
  gsap.set('.scroll-indicator', { opacity: 0.6 });
  gsap.set('.hero-grid', { opacity: 1 });
  gsap.set('.photo-data-motif', { opacity: 0.4 });
  gsap.set('.nav-logo', { opacity: 1, y: 0 });
  gsap.set('.nav-link', { opacity: 1, y: 0 });
  gsap.set('.projects-header, .project-card, .github-profile-btn, .digest-callout', { opacity: 1, y: 0 });
  gsap.set(
    '.ais-header, .ais-tool, .ais-tools-legend, .ais-artifacts-header, .ais-artifacts-bridge, .ais-artifact',
    { opacity: 1, y: 0 }
  );
}

/** Scroll-triggered entrance animations for the Projects section. */
function initProjectsAnimations(): void {
  const section = document.querySelector<HTMLElement>('.projects-section');
  if (!section) return;

  const header = section.querySelector<HTMLElement>('.projects-header');
  const cards = section.querySelectorAll<HTMLElement>('.project-card');
  const cta = section.querySelector<HTMLElement>('.github-profile-btn');

  if (header) {
    gsap.to(header, {
      opacity: 1,
      y: 0,
      duration: 0.8,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: header,
        start: 'top 85%',
        once: true,
      },
    });
  }

  // Animate digest callout right after the header
  const digest = section.querySelector<HTMLElement>('.digest-callout');
  if (digest) {
    gsap.to(digest, {
      opacity: 1,
      y: 0,
      duration: 0.75,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: digest,
        start: 'top 87%',
        once: true,
      },
    });
  }

  if (cards.length > 0) {
    gsap.to(cards, {
      opacity: 1,
      y: 0,
      duration: 0.8,
      ease: 'power3.out',
      stagger: 0.12,
      scrollTrigger: {
        trigger: section.querySelector('.projects-grid'),
        start: 'top 80%',
        once: true,
      },
    });
  }

  if (cta) {
    gsap.to(cta, {
      opacity: 1,
      y: 0,
      duration: 0.8,
      ease: 'power3.out',
      delay: 0.2,
      scrollTrigger: {
        trigger: cta,
        start: 'top 90%',
        once: true,
      },
    });
  }
}

/** Build and play the hero entrance timeline. */
function playEntranceTimeline(): void {
  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    delay: 0.35,
  });

  // Nav elements
  tl.to('.nav-logo', {
    opacity: 1,
    y: 0,
    duration: 0.7,
  })
  .to('.nav-link', {
    opacity: 1,
    y: 0,
    duration: 0.5,
    stagger: 0.08,
  }, '-=0.4')

  // Overline wipes in
  .to('.hero-overline', {
    clipPath: 'inset(0 0% 0 0)',
    duration: 0.9,
  }, '-=0.2')

  // First name: character-level reveal with blur-to-sharp
  .to('.hero-name .line:first-child .line-inner', {
    y: '0%',
    duration: 1,
    ease: 'power4.out',
  }, '-=0.45');

  // Character stagger on first name
  const firstLineChars = document.querySelectorAll('.hero-name .line:first-child .char');
  if (firstLineChars.length > 0) {
    tl.from(firstLineChars, {
      filter: 'blur(6px)',
      opacity: 0,
      duration: 0.6,
      stagger: 0.03,
      ease: 'power2.out',
    }, '-=0.8');
  }

  // Last name slides up
  tl.to('.hero-name .line:last-child .line-inner', {
    y: '0%',
    duration: 1,
    ease: 'power4.out',
  }, '-=0.6');

  // Character stagger on last name
  const lastLineChars = document.querySelectorAll('.hero-name .line:last-child .char');
  if (lastLineChars.length > 0) {
    tl.from(lastLineChars, {
      filter: 'blur(6px)',
      opacity: 0,
      duration: 0.6,
      stagger: 0.03,
      ease: 'power2.out',
    }, '-=0.8');
  }

  tl
  // Grid fades in
  .to('.hero-grid', {
    opacity: 1,
    duration: 1.8,
    ease: 'power1.inOut',
  }, '-=0.6')

  // Divider scales in
  .to('.hero-divider', {
    scaleX: 1,
    duration: 0.7,
    ease: 'power2.inOut',
  }, '-=1.2')

  // Tagline fades up
  .to('.hero-tagline', {
    opacity: 1,
    y: 0,
    duration: 0.8,
  }, '-=0.35')

  // CTA fades up
  .to('.hero-cta', {
    opacity: 1,
    y: 0,
    duration: 0.8,
  }, '-=0.5')

  // Photo fades in + scales
  .to('.photo-wrapper', {
    opacity: 1,
    scale: 1,
    y: 0,
    duration: 1.3,
    ease: 'power2.out',
  }, 0.5)

  // Data motif behind photo
  .to('.photo-data-motif', {
    opacity: 0.4,
    duration: 1.2,
    ease: 'power1.inOut',
  }, '-=0.8')

  // Accent line grows
  .to('.hero-accent-line', {
    height: '55%',
    duration: 1.4,
    ease: 'power2.inOut',
  }, 0.4)

  // Scroll indicator
  .to('.scroll-indicator', {
    opacity: 0.6,
    duration: 0.6,
  }, '-=0.2');
}

/** Mouse parallax on the photo. */
function initPhotoParallax(): void {
  const photoEl = document.querySelector<HTMLElement>('.photo-wrapper');
  if (!photoEl) return;

  let rafId: number | null = null;

  document.addEventListener('mousemove', (e: MouseEvent) => {
    const mx = (e.clientX / window.innerWidth - 0.5) * 2;
    const my = (e.clientY / window.innerHeight - 0.5) * 2;

    if (!rafId) {
      rafId = requestAnimationFrame(() => {
        gsap.to(photoEl, {
          x: mx * -12,
          y: my * -8,
          duration: 1.2,
          ease: 'power2.out',
        });
        rafId = null;
      });
    }
  });
}

/** Floating dots parallax on mouse move. */
function initDotsParallax(): void {
  const dots = document.querySelectorAll<HTMLElement>('.hero-dot');
  if (dots.length === 0) return;

  document.addEventListener('mousemove', (e: MouseEvent) => {
    const mx = (e.clientX / window.innerWidth - 0.5) * 2;
    const my = (e.clientY / window.innerHeight - 0.5) * 2;

    dots.forEach((dot, i) => {
      const speed = 0.6 + (i % 3) * 0.4;
      const direction = i % 2 === 0 ? 1 : -1;
      gsap.to(dot, {
        x: mx * 15 * speed * direction,
        y: my * 10 * speed,
        duration: 1.5 + i * 0.1,
        ease: 'power2.out',
      });
    });
  });
}

/** Magnetic CTA button effect. */
function initMagneticCTA(): void {
  const cta = document.querySelector<HTMLElement>('.hero-cta');
  if (!cta) return;

  cta.addEventListener('mousemove', (e: MouseEvent) => {
    const rect = cta.getBoundingClientRect();
    const dx = e.clientX - rect.left - rect.width / 2;
    const dy = e.clientY - rect.top - rect.height / 2;

    gsap.to(cta, {
      x: dx * 0.18,
      y: dy * 0.18,
      duration: 0.35,
      ease: 'power2.out',
    });
  });

  cta.addEventListener('mouseleave', () => {
    gsap.to(cta, {
      x: 0,
      y: 0,
      duration: 0.55,
      ease: 'elastic.out(1, 0.45)',
    });
  });
}

/** Cursor-reactive glow that follows the pointer. */
function initCursorGlow(): void {
  const glow = document.querySelector<HTMLElement>('.cursor-glow');
  if (!glow) return;

  document.addEventListener('mousemove', (e: MouseEvent) => {
    gsap.to(glow, {
      x: e.clientX,
      y: e.clientY,
      duration: 0.8,
      ease: 'power2.out',
    });
  });
}

/** Scroll-triggered exit: hero elements parallax/fade out. */
function initScrollExit(): void {
  const hero = document.querySelector<HTMLElement>('.hero');
  if (!hero) return;

  const heroContent = hero.querySelector<HTMLElement>('.hero-content');
  const scrollIndicator = hero.querySelector<HTMLElement>('.scroll-indicator');

  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    const heroHeight = hero.offsetHeight;
    const progress = Math.min(scrollY / (heroHeight * 0.6), 1);

    if (heroContent) {
      heroContent.style.transform = `translateY(${scrollY * 0.25}px)`;
      heroContent.style.opacity = `${1 - progress * 0.8}`;
    }

    if (scrollIndicator) {
      scrollIndicator.style.opacity = `${Math.max(0, 0.6 - progress * 2)}`;
    }
  }, { passive: true });
}

/** Wrap each character in a <span class="char"> for stagger animations. */
function wrapCharsInSpans(): void {
  const lineInners = document.querySelectorAll<HTMLElement>('.hero-name .line-inner');

  lineInners.forEach((el) => {
    const text = el.textContent ?? '';
    el.innerHTML = '';
    for (const char of text) {
      const span = document.createElement('span');
      span.className = 'char';
      span.textContent = char === ' ' ? '\u00A0' : char;
      el.appendChild(span);
    }
  });
}

/** Scroll-triggered entrance animations for the AI Stack section. */
function initAIStackAnimations(): void {
  const section = document.querySelector<HTMLElement>('.ais');
  if (!section) return;

  // Header entrance
  const header = section.querySelector<HTMLElement>('.ais-header');
  if (header) {
    gsap.to(header, {
      opacity: 1,
      y: 0,
      duration: 0.8,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: header,
        start: 'top 85%',
        once: true,
      },
    });
  }

  // ── Tool Command Center ──

  // Orbital ring fade-in
  const ring = section.querySelector<HTMLElement>('.ais-command-ring');
  if (ring) {
    gsap.to(ring, {
      opacity: 1,
      duration: 1.2,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: section.querySelector('.ais-command'),
        start: 'top 82%',
        once: true,
      },
    });
  }

  // Tool legend fade-in — animates first
  const legend = section.querySelector<HTMLElement>('.ais-tools-legend');
  if (legend) {
    gsap.to(legend, {
      opacity: 1,
      duration: 0.5,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: section.querySelector('.ais-command'),
        start: 'top 82%',
        once: true,
      },
    });
  }

  // Tool chips — staggered cascade entrance (after legend)
  const tools = section.querySelectorAll<HTMLElement>('.ais-tool');
  if (tools.length > 0) {
    gsap.to(tools, {
      opacity: 1,
      y: 0,
      duration: 0.7,
      ease: 'power3.out',
      stagger: 0.12,
      delay: 0.1,
      scrollTrigger: {
        trigger: section.querySelector('.ais-tools-row'),
        start: 'top 82%',
        once: true,
      },
    });
  }

  // ── AI Artifacts ──

  const artifactsHeader = section.querySelector<HTMLElement>('.ais-artifacts-header');
  if (artifactsHeader) {
    gsap.to(artifactsHeader, {
      opacity: 1,
      y: 0,
      duration: 0.75,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: artifactsHeader,
        start: 'top 85%',
        once: true,
      },
    });
  }

  // Bridge connecting line
  const bridge = section.querySelector<HTMLElement>('.ais-artifacts-bridge');
  if (bridge) {
    gsap.to(bridge, {
      opacity: 1,
      duration: 0.6,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: bridge,
        start: 'top 85%',
        once: true,
      },
    });
  }

  // Artifact cards — staggered with slight scale
  const artifacts = section.querySelectorAll<HTMLElement>('.ais-artifact');
  if (artifacts.length > 0) {
    gsap.fromTo(artifacts, {
      opacity: 0,
      y: 16,
      scale: 0.97,
    }, {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 0.65,
      ease: 'power3.out',
      stagger: 0.1,
      scrollTrigger: {
        trigger: section.querySelector('.ais-artifacts-grid'),
        start: 'top 83%',
        once: true,
      },
    });
  }

  // ── AI Impact Section ──

  const impactHeader = section.querySelector<HTMLElement>('.ais-impact-header');
  if (impactHeader) {
    gsap.fromTo(impactHeader, {
      opacity: 0,
      y: 24,
    }, {
      opacity: 1,
      y: 0,
      duration: 0.8,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: impactHeader,
        start: 'top 85%',
        once: true,
      },
    });
  }

  // Language expansion bars — animate fill widths
  const langBars = section.querySelectorAll<HTMLElement>('.ais-expansion-lang-fill');
  if (langBars.length > 0) {
    langBars.forEach((bar) => {
      const targetWidth = bar.style.width;
      bar.style.width = '0%';
      gsap.to(bar, {
        width: targetWidth,
        duration: 1,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: bar.closest('.ais-expansion-languages'),
          start: 'top 85%',
          once: true,
        },
      });
    });
  }

  // Coverage bars — animate fill widths
  const covBars = section.querySelectorAll<HTMLElement>('.cov2-bar-fill');
  if (covBars.length > 0) {
    covBars.forEach((bar) => {
      const targetWidth = bar.style.width;
      bar.style.width = '0%';
      gsap.to(bar, {
        width: targetWidth,
        duration: 1.1,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: bar.closest('.cov2-bars'),
          start: 'top 85%',
          once: true,
        },
      });
    });
  }

  // Impact grid columns — stagger left/right
  const impactCols = section.querySelectorAll<HTMLElement>('.ais-impact-col');
  if (impactCols.length > 0) {
    gsap.fromTo(impactCols, {
      opacity: 0,
      y: 20,
    }, {
      opacity: 1,
      y: 0,
      duration: 0.8,
      ease: 'power3.out',
      stagger: 0.2,
      scrollTrigger: {
        trigger: section.querySelector('.ais-impact-grid'),
        start: 'top 82%',
        once: true,
      },
    });
  }
}

/** Initialize all hero animations and interactions. */
export function initHeroAnimations(): void {
  wrapCharsInSpans();

  if (prefersReducedMotion) {
    showWithoutAnimation();
    return;
  }

  playEntranceTimeline();
  initPhotoParallax();
  initDotsParallax();
  initMagneticCTA();
  initCursorGlow();
  initScrollExit();
  initProjectsAnimations();
  initAIStackAnimations();
}
