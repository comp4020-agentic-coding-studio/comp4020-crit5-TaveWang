# COMP4020 prototype

This is your repo for a COMP4020 prototype: a static site built with **Astro +
React islands**, deployed to GitHub Pages. The **deployed site is what gets
marked** --- not this repo, and not "it works on my machine". It's marked live
in Chrome against the deployed URL at two viewports --- 1920×1080 (desktop) and
390×844 (phone) --- and both count in full, so make that artefact good at both
and use the checks below to know whether it is.

What you're building this week — the spec — is published on the course website,
and this repo's name tells you which deliverable it is. Run the course plugin's
**start** skill at the start of each week: it pulls the right spec from the
course API, carries your harness forward from last week, and helps you turn the
spec's checkable lines into tests of your own. Read the spec before you build,
and see `spec/README.md` for how the checks in this repo relate to it.

## How to work in here

- Keep the dev server running (`pnpm dev`) so you see changes as you make them.
- Before you push, run `pnpm check`. It runs most of what CI runs --- build,
  lint, and the spec --- so you catch those in seconds instead of waiting for
  the pipeline. The links check, the evidence check, the secrets scan, and the
  deploy itself only run in CI; run `pnpm dlx linkinator ./dist --silent`
  locally against a fresh `pnpm build` for the links check without waiting for
  CI.
- To see what the page actually looks like rather than what you assume it looks
  like, open it in a browser (the `agent-browser` CLI, documented on
  [the course site](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/backpressure/#agent-browser-the-rendered-page-as-ground-truth),
  works well for this). The rendered page is the truth; your mental model of it
  isn't.
- When a check fails, read its output before changing anything. Each check below
  names what it measures, and the failure message is the instruction: it tells
  you the file, the line, or the contract. Treat a red check as authoritative
  --- the page is wrong until the check is green, not until you decide it should
  be.
- Commit when the checks pass. Never commit a red state.

## The link-preview card

`public/card.png` (1200x630) is the image a shared link shows; the page head
points at it. Replace it and the `description` meta, and copy the head block
into any new page. The card URL resolves against the page that names it, like
any link --- `./card.png` is wrong one directory down, and nothing in CI checks
it, so look at the deployed head when you add pages.

## The checks (your sensors)

CI runs these on every push once your repo is public. GitHub's checks UI shows
two jobs, `check` and `deploy` --- not one status per sensor below --- and
within `check` the steps run in sequence (`pnpm check` chains typecheck, build,
lint, and the spec with `&&`), so an early failure like a broken build stops the
later sensors from running for that push; fix it and push again to see the rest.
While the repo is private (all week, until you ship) the CI jobs stay skipped
--- `pnpm check` is the same roster on your machine, and it's the faster loop
anyway. They aren't hoops. Each is a different way of finding out something true
about the site that you can't reliably see by looking at it.

They also carry a mark at a crit: the sweep runs fifteen minutes after your
cutoff, and green checks there are worth half that week's shipped mark. Still
running counts as not green, so ship with time for CI to finish.

- **typecheck** --- `astro check` runs first in `pnpm check`, so a type error
  stops the roster before the build even starts. (It replaced `tsc --noEmit`
  when the stack switched to Astro: `tsc` alone does not see inside `.astro`
  files.) The types are extra backpressure: a red here is the compiler telling
  you a claim in the code is false.
- **build** --- the site must build (`pnpm build`). A build failure means the
  deployed site is broken or stale, so nothing else matters until this is green.
- **deploy / online** --- the live GitHub Pages URL must load and return the
  page you expect. An asset that 404s on the deployed URL counts as broken even
  if it loads locally.
- **spec** --- `spec/invariants.test.ts` asserts what's true of any good
  website, whatever the week's brief asks; the tests you write for the week's
  own spec run alongside it (any `spec/*.test.ts`). A failure names the contract
  you haven't met yet.
- **lint** --- `stylelint` for CSS, `oxlint` for TypeScript. Flags code that's
  wrong, fragile, or non-idiomatic. Read the rule it names.
- **tests** --- any other tests you write, wherever you put them (co-located
  with your source is fine, not just `spec/`), must pass. Vitest picks up both
  this and the spec suite in one `vitest run`, the last step of `pnpm check`. A
  failing test is a claim about the site that's no longer true.
- **evidence** (`pnpm check:evidence`) --- checks your process evidence:
  `PROCESS.md`'s citations resolve to real commits, the current deliverable's
  exact reflection is in `reflections/` (worked out from this repo's name
  against the public course API), and your `CLAUDE.md` is present. Evidence
  gates the deploy --- `deploy` needs `check` to pass, so failing evidence
  blocks the deploy alongside everything else. See
  [Your process is part of the mark](#your-process-is-part-of-the-mark) below,
  and the course website's
  [assessment page](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/#what-you-submit)
  for what counts as evidence.
- **links** --- internal links must resolve. A broken link is a dead end you
  didn't mean to ship.
- **secrets** --- the repo is scanned for committed credentials. Never put a
  key, token, or password in a tracked file. If one leaks, rotate it. A local
  pre-commit hook (`.githooks/pre-commit`, installed by `pnpm install`) also
  blocks any commit containing something shaped like an API key --- by the time
  CI sees a key it's already pushed, so the hook is the sensor that matters.

Nothing here measures **accessibility** or **performance** --- wiring those
sensors (`axe-core`, Lighthouse, or whatever you choose) is your work, and later
in the course the spec will ask you to show how you tested both. When you do,
read a green performance result honestly: it's a lab estimate from one run on a
CI machine, not proof the site is fast for real users.

## The stack: Astro + React islands, and why

The template ships plain HTML/CSS/TypeScript on Vite. A past week's brief
needed real interactivity, so it was swapped for Astro with React islands, and
this deliverable keeps that swap. The contract CI enforces is unchanged:
`pnpm build` emits the whole site into `dist/`, the `check`, `check:evidence`
and `build` scripts keep working, and whatever lands in `dist/` passes `spec/`.

**Never use `client:only`.** The invariants parse the *built* HTML, so they need
`<nav>`, the single `<h1>` and every `alt` to be in the file on disk. Astro
server-renders `client:load` and `client:visible` islands at build time and
hydrates them afterwards, so their markup ships; `client:only` renders nothing
at build and would fail the invariants against an empty shell. This is exactly
why a plain client-side React app is not an option here.

Above the fold is a natural fit for `client:load`; content further down can use
`client:visible`. One consequence when testing: a `client:visible` island is
**not interactive until it is scrolled into view**, so driving it in a browser
needs a `scrollIntoView()` first or the click lands on un-hydrated markup and
silently does nothing.

## Every URL this build emits must be relative

The deployed site lives under a subpath
(`…github.io/comp4020-crit5-TaveWang/`), but CI runs `linkinator ./dist`, which
serves `dist/` at the **root**. No absolute URL satisfies both, and getting it
wrong looks perfect locally while every asset 404s on the live URL.

`astro.config.mjs` handles it with two settings, not with `base`:

- `build.format: "file"` --- pages land flat (`dist/index.html`,
  `dist/whatever.html`), so `./whatever.html` resolves the same from any page,
  and `dist/index.html` stays where `spec/invariants.test.ts` looks for the
  home page.
- `build.assetsPrefix: "."` --- emits `./_astro/x.js` instead of `/_astro/x.js`.

Links you hand-write are still your problem: write `./whatever.html`, never
`/whatever.html`.

**Images belong in `src/assets/` and get `import`ed, not written into CSS.** A
`url()` inside a stylesheet resolves against the *bundled stylesheet* — which
lands in `_astro/` — so `./pic.png` looks for `_astro/pic.png` and 404s, while
`../pic.png` only works by accident of how deep the CSS happens to sit.
Importing the file in the component instead (`import pic from
"../assets/pic.png"`) lets Vite emit the hashed URL under the configured
`assetsPrefix`, giving `./_astro/pic.hash.png` — correct both at the site root
where CI's link check serves `dist/`, and under the deployed project subpath.
Check it after building: `grep -o 'url([^)]*)' dist/index.html`.

**Dynamic routes must stay flat for the same reason.** `assetsPrefix: "."`
resolves against the *page's own directory*, so a nested dynamic route like
`src/pages/thing/[id].astro` would emit `dist/thing/foo.html` looking for
`dist/thing/_astro/…` and 404 every asset on the deployed site --- while working
perfectly in `astro preview` served from the root. Keep dynamic-route output
flat (params baked into the filename, e.g. `src/pages/[slug].astro`) rather than
nested under a directory.

## Islands can't share state without a store

The page is several separate React roots. Component state cannot travel
between them directly --- if two islands both need the same live value (a
count, a selection), reach for a module-level store read through
`useSyncExternalStore` rather than context, since context does not cross a root
boundary. `useSyncExternalStore` needs its third argument (the server
snapshot), or the build-time render throws.

## stylelint: what I configured and what I left alone

`selector-class-pattern` rejects BEM out of the box. `.stylelintrc.json` widens
it to accept `block__element--modifier` --- that is a naming convention, not a
correctness rule, so it's fine to adjust further if this week's CSS wants a
different convention.

`no-descending-specificity` is left **on**, and is not to be disabled or worked
around by shuffling blocks. When it fired on several near-identical rules, the
fix was one shared class. Fix it by naming, every time; reordering just flips
which selector it complains about.

## The rendered page is the truth

Source can read fine while the page is broken --- visual overflow, or a text
node collapsing to nothing because a newline between two inline elements
disappears in the render. Neither shows up in the DOM inspection and neither
fails a test.

Before claiming a visual change works, build it, serve it, and screenshot it at
**1280** and **390×844** --- both viewports are marked in full. `agent-browser`
does this well; note that it resets the shell's working directory, so `cd` back
into the repo before running `pnpm` afterwards.

## Your process is part of the mark

The deployed page is only half of it. How you got there is marked too: your
commit history, your agent files, and the decisions visible across them. The
checks above can't see any of that, so a person reads it directly --- which
means building legibly is part of building well.

- **Commit as you go.** Small, frequent commits are the record of how the work
  came together, and that record is read, not just the final state. A trail that
  grew alongside the code is the strongest evidence of your process; a single
  dump the night before is the weakest.
- **Keep a process overview** (`PROCESS.md`). A short reading-guide, not an
  essay: what you built, the moments that mattered --- each pointing at a
  commit, a `CLAUDE.md` change, or a prompt and the commit it produced --- and
  where to look in the history. It points a marker at the evidence; it doesn't
  stand in for it, and claims the history doesn't back don't count. The
  `PROCESS.md` in this repo is a template showing the shape and the citation
  format (link text the commit hash or range, target the commit or compare URL);
  `pnpm check:evidence` verifies your citations resolve to real commits before
  you ship. Markers follow those citations and don't trawl the repo for evidence
  you didn't cite.
- **Write your reflection in `reflections/`** --- a short markdown file in this
  repo, named for the deliverable it answers, so the number in the filename is
  the number in this repo's name (`crit-1.md` in `comp4020-crit1-<you>`,
  `assignment-1.md` in `comp4020-ass1-<you>`); `reflections/README.md` has the
  full rule. `pnpm check:evidence` checks the exact current name against the
  course API, not merely the presence of any well-named file. It answers the two
  standing prompts: the breakthrough that moved the work forward, and what this
  work changed about the developer you want to be. It stays out of the deployed
  site. It's due at the cutoff, and if it isn't in the repo by then the week
  doesn't count as shipped, however good the prototype is.
- **This file is process evidence.** The harness you build to direct the agent,
  this `CLAUDE.md` and any `AGENTS.md`, is itself read as part of how you
  worked. Keep it honest and current (see below).

You don't need a name, a student number, or any identity file in the repo: we
know whose repo it is. Spend the effort on the work.

## This file is yours

This CLAUDE.md is a starting point, not a fixed rulebook. As you learn what your
prototype needs --- a convention to hold the agent to, a sensor that keeps
catching you out (a linter, say), a fact about the stack the agent keeps
getting wrong --- write it down here and wire it into `check`. Growing this
file is the work of harness engineering, and the gap between this boilerplate
and your own version is part of what your prototype says about the developer
you're becoming.
