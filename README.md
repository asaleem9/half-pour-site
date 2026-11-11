# half-pour-site

The marketing site for Half Pour, an iPhone app for people who want to cut back on drinking, not quit.

Live at https://half-pour-site.vercel.app

## Stack

- [Astro](https://astro.build) 7, static output, no client framework
- Tailwind CSS 4 (tokens in `src/styles/global.css`, mirrored from the app's design system)
- GSAP for motion, Lenis for smooth scrolling on pointer devices
- HyperFrames compositions for the film and the looping motion pieces (`hyperframes/`)

## Commands

```sh
npm install
npm run dev        # local server on http://localhost:4321
npm run build      # checks the repo, builds, checks the built pages
npm run preview    # serves the build
npm run shoot      # screenshot strip of every scroll position, in shots/
npm test           # planner logic
```

## Layout

- `src/pages` the landing page, `/privacy` and `/support`
- `src/components/acts` one file per section of the landing page
- `src/behaviours` the scripts that drive each section
- `src/lib/config.ts` values that change at launch (set `PUBLIC_APP_STORE_URL` in the host's environment)
- `scripts/` asset pipelines and checks
- `art/` the manifest for site-only illustrations

## Notes

Half Pour is a tracker, not a medical device. The site never shows blood alcohol estimates and nothing on it rewards drinking more.
