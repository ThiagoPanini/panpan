# Thiago Panini — Portfolio

Personal portfolio site for Thiago Panini, Staff Analytics Engineer.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:4321](http://localhost:4321) to view the site.

## Build

```bash
npm run build
npm run preview
```

## Tech decision

**Astro** was chosen as the framework for three reasons:

1. **Zero JS by default.** A portfolio is a content-driven static site. Astro ships zero client-side JavaScript unless explicitly opted in via `<script>` tags or islands, resulting in faster load times and better Lighthouse scores.
2. **Component architecture without framework overhead.** Astro's `.astro` components provide clean separation of concerns (Nav, Hero, Layout) without bundling a reactive framework like React or Vue. The only client JS is the GSAP animation module, which is explicitly imported.
3. **Simplicity over Vite+vanilla.** Astro provides routing, build optimization, image handling, and HTML minification out of the box — things that would require manual configuration with plain Vite.

**Styling:** Vanilla CSS with custom properties was chosen over Tailwind because:
- The design uses carefully crafted visual effects (gradients, masks, grain textures) that are more naturally expressed in authored CSS than utility classes.
- Custom properties serve as design tokens, keeping the system consistent and easy to theme.
- No build-time CSS processing overhead.

**Typography:** Space Grotesk replaces Instrument Serif for the display name. It's a geometric sans-serif with strong visual weight at large sizes, sharp terminals, and a modern technical character that reinforces the engineering persona. Outfit remains as the body font — its rounded, friendly forms complement Space Grotesk's precision without competing with it.

## Planned sections

| Section | Rationale |
|---------|-----------|
| **About** | Personal bio, technical philosophy, and identity — the foundation of any portfolio. |
| **Projects** | Showcase data platforms, analytics pipelines, dashboards, and tools built at scale — the primary proof of expertise. |
| **Writing** | Technical blog posts on data engineering, modeling, and architecture — demonstrates thought leadership. |
| **Open Source** | Libraries, frameworks, and community contributions — shows impact beyond employers. |
| **Experience** | Career timeline with roles, companies, tech stacks, and measurable impact — establishes credibility. |
| **Contact** | Direct outreach channel for collaboration, speaking engagements, or opportunities. |

## Project structure

```
src/
├── assets/          # Images, self-hosted fonts
├── components/      # Astro components (Nav, Hero)
├── layouts/         # Page layout wrappers (BaseLayout)
├── pages/           # Route-based pages (index)
├── styles/          # Global styles, design tokens, component styles
└── scripts/         # GSAP animations, utilities
public/              # Static assets (favicon, profile photo)
```
