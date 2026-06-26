# UI Library Mental Models & AI-Slop Detection Rules

> Research synthesis for `slopbrick`. Covers the dominant web and native UI libraries, their idiomatic patterns, the anti-patterns that AI coding assistants produce reliably, and concrete rule proposals.

---

## TL;DR

Different UI libraries encode different "correct" ways to style, compose, and fetch data. An AI frontend auditor must know those mental models, because a pattern that is slop in one library is idiomatic in another. This report maps the major ecosystems, identifies the slop signals that are library-agnostic versus library-specific, and proposes new `slopbrick` rules grouped by detectability and impact.

Key takeaways for `slopbrick`:

- **React Native / Tamagui / Expo** treat numeric layout values and inline style props as normal. The current `visual/inline-style` and `visual/raw-style-values` rules are therefore noisy in native code and need framework-aware gating.
- **Tailwind / shadcn / Radix / Base UI** expect utility classes, token references, and composable primitives. Slop appears as arbitrary escape values, hardcoded colors, magic spacing, and missing `asChild` composition.
- **MUI / Chakra / Panda** expect theme tokens via `sx` or `styled()` and recipes/variants. Slop appears as raw literals, dynamic conditional style props, and inconsistent override methods.
- **React Server Components / Next.js App Router** expect server-first boundaries. Slop appears as unnecessary `'use client'`, client-side data fetching that could be server-side, and serialization violations.
- **Vue / Nuxt, Svelte / SvelteKit, Solid, Qwik** each have distinct reactivity, data-loading, and hydration rules. A cross-framework auditor needs framework-specific detection, not just React-centric rules.
- **AI-generated copy** is a separate signal: placeholder text, generic CTAs, sycophancy phrases, and LLM buzzwords can be detected with string heuristics and should be a distinct rule category (`typo/ai-copy`).

---

## 1. Why mental models matter for slop detection

Static analyzers that treat all frontend code the same way produce false positives. A `padding: 20` value is a token violation in Tailwind but a standard layout value in React Native. A `style={{ ... }}` object is discouraged in plain React web code but is the encouraged authoring mode in Tamagui. A `'use client'` directive is a failure in a Next.js App Router project but irrelevant in a Vue or Svelte app.

An effective AI-slop auditor therefore needs two layers:

1. **Universal slop rules** — patterns that are bad in almost every frontend context (missing keys, unsafe `dangerouslySetInnerHTML`, hardcoded secrets, missing labels, broken hook rules).
2. **Framework-aware rules** — patterns whose severity depends on the library (inline styles in web vs. native, client boundaries in RSC vs. SPA, signals vs. hooks, runes vs. stores).

The rest of this report catalogs the major ecosystems, their mental models, and the specific rules that should fire when AI-generated code violates them.

---

## 2. React, React Native, and cross-platform stacks

### 2.1 Plain React (web, non-RSC)

The conventional React mental model for styling has shifted over time:

- **2015–2019**: CSS modules or CSS-in-JS (Styled Components / Emotion) were dominant. Inline `style` props were tolerated only for dynamic values.
- **2020–2023**: Tailwind CSS and utility-first CSS became the default for new projects. Component libraries like Chakra and MUI exposed `sx` props.
- **2024–2026**: shadcn/ui + Radix + Tailwind is the most common new-project stack. Inline styles are now considered slop unless absolutely dynamic.

Production-grade plain React code today is expected to:

- Use Tailwind utility classes or CSS modules for static styles.
- Use CSS custom properties / design tokens for colors, spacing, radii, shadows, z-index.
- Extract repeated patterns into components, not copy-paste classes.
- Keep event handlers referentially stable where possible.
- Avoid inline arrow functions in render-heavy lists.
- Use `React.memo`, `useMemo`, `useCallback` only after profiling.

Common AI slop in plain React:

| Pattern | Why it is slop | Proposed rule |
|---------|----------------|---------------|
| `style={{ padding: 20, color: '#333' }}` | Bypasses design tokens; harder to theme | `visual/inline-style` |
| `className="p-[13px]"` | Magic value outside the token scale | `visual/magic-number-spacing` |
| `className="bg-[#3b82f6]"` | Hardcoded color instead of token | `visual/hardcoded-color` |
| `key={index}` | Reconciliation bugs on reorder/delete | `logic/key-prop-index` |
| `onClick={() => doThing()}` | New function per render, breaks memo | `logic/event-handler-inline` |
| `useEffect(() => { fetch(...) }, [])` | No abort, no dedup, no error branch | `logic/useeffect-fetch` |
| `props: any` | Short-circuits TypeScript | `logic/explicit-any` |

### 2.2 React Native and Expo

React Native has a fundamentally different styling model. There are no CSS classes. Styles are authored as JavaScript objects, either inline or via `StyleSheet.create`. Numeric values are the standard unit for layout dimensions (density-independent pixels). Colors are strings. Flexbox is the default layout algorithm.

The production-grade mental model:

- Prefer `StyleSheet.create` for static styles.
- Use a theme object / design tokens for colors, spacing, typography.
- Avoid hardcoded pixel values for layout when percentage or flex would adapt better.
- Use platform-specific files (`*.ios.js`, `*.android.js`) or `Platform.select` only when necessary.
- Keep inline styles for truly dynamic, prop-driven values.

This means the web-centric `visual/inline-style` rule is misfiring in React Native. The correct signal is not "inline style exists" but "inline style exists where `StyleSheet` would suffice" or "inline style uses values that should be tokens".

Recommended framework-aware behavior:

| Rule | Web default | React Native / Expo default |
|------|-------------|----------------------------|
| `visual/inline-style` | medium | off or info |
| `logic/style-sheet-avoidance` | medium | medium (the primary inline-style rule for RN) |
| `visual/raw-style-values` | low | only flag raw colors and font sizes; ignore numeric layout values |
| `visual/hardcoded-color` | low | medium |

RN-specific slop patterns:

| Pattern | Proposed rule |
|---------|---------------|
| `color="red"` instead of `color={theme.colors.error}` | `visual/hardcoded-color` |
| `padding={20}` when `theme.spacing.md` exists | `visual/raw-style-values` |
| `width: 300` in a component that should be responsive | `visual/forced-layout` |
| `StyleSheet.create` not used for static styles | `logic/style-sheet-avoidance` |

### 2.3 Tamagui

Tamagui is explicitly designed to make inline styles ergonomic and performant. Its documentation says: "We encourage you to use inline styles. Combined with shorthands they can lead to really easy styling, and the Tamagui optimizing compiler will take care of optimizing everything for you." [^1^].

The Tamagui mental model:

- Inline style props are first-class: `<View margin={10} color="$color" />`.
- Tokens are referenced with `$` prefixes: `padding="$4"`, `color="$blue10"`.
- Shorthands are encouraged: `c` for color, `p` for padding, `mx` for margin horizontal.
- Variants and `styled()` are used for reusable component patterns.
- The compiler flattens styled components and extracts CSS at build time.

AI slop in Tamagui:

| Pattern | Why it is slop | Proposed rule |
|---------|----------------|---------------|
| `padding={20}` instead of `padding="$4"` | Value not from token scale | `visual/raw-style-values` |
| `color="red"` instead of `color="$red10"` | Hardcoded color | `visual/hardcoded-color` |
| `style={{ padding: 20 }}` when a prop would work | Fights the compiler and the mental model | `visual/inline-style` |
| `borderRadius={8}` instead of `borderRadius="$3"` | Magic number | `visual/non-token-radius` |

The key distinction for Tamagui: **numeric layout values are fine if they are token references**; raw literals are slop. The current `visual/raw-style-values` rule cannot distinguish the two because it only inspects `styleProps` extracted from the `style` attribute. It needs to inspect Tamagui prop-style attributes too.

### 2.4 React Server Components and Next.js App Router

React Server Components introduce a server-first execution model:

- Server Components are the default.
- Client Components must be explicitly marked with `'use client'`.
- Client Components cannot import Server Components directly; Server Components can pass JSX as children/props through the boundary.
- Data fetching should happen in Server Components when possible.
- Props crossing the boundary must be serializable.

The mental model is: **interactivity is the exception, not the default**. Every `'use client'` directive adds bundle cost and constrains composition.

AI slop in RSC/Next.js:

| Pattern | Why it is slop | Proposed rule |
|---------|----------------|---------------|
| `'use client'` on a component that only renders static markup | Unnecessary client bundle | `logic/use-client-overuse` |
| `useEffect(() => fetch(...), [])` in a Client Component when the parent could fetch server-side | Wastes RSC benefits | `logic/useeffect-fetch` |
| Client Component imports a Server Component directly | Build/runtime error | `logic/boundary-violation` (extend) |
| Passing functions or class instances from Server to Client Component | Serialization failure | `logic/non-serializable-prop` |
| `async` Client Component | Invalid | `logic/async-client-component` |

---

## 3. Tailwind CSS and utility-first CSS

### 3.1 Mental model

Tailwind's core idea is that styles are composed from constrained, single-purpose utility classes directly in markup. The framework ships a built-in design token system (spacing scale, color palette, type scale, shadows, radii, breakpoints). Custom tokens are added via the theme config.

Production-grade Tailwind code:

- Stays within the configured token scale.
- Extracts repeated patterns into components or `@apply` blocks.
- Uses arbitrary values (`w-[123px]`, `bg-[#123456]`) only for genuine one-offs.
- Uses Tailwind v4 syntax (`bg-red-500/50`, `flex!`) rather than v3 legacy.
- Combines with CSS variables for dynamic values.

### 3.2 AI slop in Tailwind

| Pattern | Why it is slop | Proposed rule |
|---------|----------------|---------------|
| `w-[123px]`, `p-[13px]`, `top-[17px]` | Magic arbitrary values outside the scale | `visual/arbitrary-escape` (exists), `visual/magic-number-spacing` |
| `bg-[#3b82f6]`, `text-[#ff0000]` | Hardcoded color instead of `bg-blue-500` | `visual/hardcoded-color` |
| `!bg-red-500` in v4 code | Legacy v3 syntax | `visual/legacy-tailwind-syntax` |
| `bg-opacity-50` in v4 code | v3 syntax removed in v4 | `visual/legacy-tailwind-syntax` |
| `grid-cols-[max-content,auto]` | Invalid v4 arbitrary syntax | `visual/arbitrary-escape` |
| Long className strings with no extraction | Readability and maintainability | `component/props-interface-bloat` or `component/giant-component` |
| `className="flex justify-center items-center"` repeated everywhere | Missing component abstraction | `component/duplicated-component` |

A Tailwind-specific refinement: arbitrary values should be allowlisted by use case. The current `arbitraryValueAllowlist` config is the right mechanism; it should be expanded with common legitimate values like `w-[calc(100%-2rem)]`, `top-[var(--header-height)]`.

---

## 4. shadcn/ui, Radix UI, Base UI

### 4.1 Mental model

- **Radix UI** provides unstyled, accessible primitives (Dialog, Select, Tooltip, etc.). It handles behavior, focus management, keyboard navigation, and ARIA. It does not provide styles.
- **shadcn/ui** copies pre-styled components into your project, built on Radix + Tailwind + CVA (Class Variance Authority). You own the code.
- **Base UI** is the newer unstyled/headless component library from the MUI team, positioned similarly to Radix.

Production-grade code with these libraries:

- Uses the primitive's composition API (`Dialog.Trigger`, `Dialog.Content`, etc.).
- Customizes via Tailwind classes and CSS variables, not by rewriting primitive internals.
- Uses `asChild` for polymorphic composition when appropriate.
- Preserves built-in accessibility rather than replacing it with custom markup.

### 4.2 AI slop with shadcn/Radix/Base UI

| Pattern | Why it is slop | Proposed rule |
|---------|----------------|---------------|
| Replacing Radix `Dialog.Content` with a custom non-semantic div | Loses accessibility | `wcag/non-semantic-dialog` |
| Not using `asChild` when wrapping a primitive around a custom trigger | Composition friction | `component/shadcn-prop-mismatch` (extend) |
| Hardcoded color values in copied shadcn component files | Breaks theming | `visual/hardcoded-color` |
| Removing `aria-*` attributes from copied components | Accessibility regression | `wcag/aria-redundant` inverse or `wcag/missing-aria` |
| Using shadcn components without matching Tailwind theme variables | Visual mismatch | `visual/theme-variable-missing` |

---

## 5. MUI, Chakra UI, Panda CSS

### 5.1 MUI mental model

MUI (formerly Material-UI) provides styled components and a theme system. The primary customization APIs are:

- `ThemeProvider` + `createTheme` for global tokens.
- `sx` prop for one-off, theme-aware overrides.
- `styled()` for reusable theme-aware components.
- Base UI for unstyled primitives.

Production-grade MUI code:

- Defines the theme centrally.
- Uses token references like `sx={{ color: 'primary.main', p: 2 }}`.
- Avoids inline `style` props.
- Does not mutate the theme object directly.

### 5.2 Chakra UI / Panda CSS mental model

Chakra and Panda share a similar style-prop API but differ in runtime cost:

- **Chakra** is runtime CSS-in-JS; style props are evaluated on every render.
- **Panda** is build-time CSS-in-JS; it extracts static styles and generates atomic CSS.

Production-grade code:

- Uses token references (`padding="4"`, `color="blue.500"`).
- Uses recipes/variants for component states instead of dynamic conditional style props.
- Uses data attributes and CSS variables for dynamic state in Panda.
- Avoids mixing arbitrary raw values with token-based props.

### 5.3 AI slop in MUI / Chakra / Panda

| Pattern | Why it is slop | Proposed rule |
|---------|----------------|---------------|
| `sx={{ padding: '20px' }}` | Raw value instead of `p: 2.5` or `p: 'spacing.5'` | `visual/raw-style-values` |
| `style={{ color: 'red' }}` on MUI component | Should use `sx` or theme token | `visual/inline-style` |
| Dynamic conditional style props in Panda (`bg={isActive ? 'blue.500' : 'gray.100'}`) | Cannot be statically extracted; causes runtime overhead | `perf/dynamic-style-prop` |
| Hardcoded breakpoints | Breaks theme responsive strategy | `visual/breakpoint-hardcode` |
| `styled.div` without theme access | Misses token integration | `visual/non-token-styled` |

---

## 6. CSS-in-JS: Styled Components and Emotion

### 6.1 Mental model

CSS-in-JS co-locates styles with components. It offers scoped styles, theming, and dynamic styling based on props. However, runtime CSS-in-JS has fallen out of favor for new projects because:

- It increases bundle size and runtime cost.
- It is incompatible with React Server Components unless wrapped in Client Components.
- Styled-components is effectively in maintenance mode as of 2025 [^2^].

Production-grade CSS-in-JS code:

- Uses theme tokens inside templates: `${props => props.theme.colors.primary}`.
- Avoids dynamic style injection for large lists.
- Migrates toward zero-runtime alternatives (Panda, Tailwind, CSS modules) for new code.

### 6.2 AI slop in CSS-in-JS

| Pattern | Why it is slop | Proposed rule |
|---------|----------------|---------------|
| `styled.div` color: #3b82f6; `` | Hardcoded color | `visual/hardcoded-color` |
| `padding: 20px;` | Magic number | `visual/magic-number-spacing` |
| Dynamic template literal based on props in render-heavy component | Runtime cost | `perf/dynamic-css-in-js` |
| `createGlobalStyle` for component styles | Leaks scope | `arch/global-style-misuse` |

---

## 7. Vue and Nuxt

### 7.1 Mental model

Vue 3 with the Composition API is the current default. Key concepts:

- `<script setup>` for concise component definitions.
- `ref`, `reactive`, `computed` for reactivity.
- Composables for reusable logic.
- `provide` / `inject` for dependency injection.
- Nuxt adds file-based routing, auto-imports, server routes, and `useFetch` / `useAsyncData` for data fetching.

Production-grade Vue/Nuxt code:

- Uses composables for business logic and API calls, keeping components focused on presentation.
- Uses `useState` or Pinia for SSR-friendly state.
- Fetches data server-side in Nuxt when possible.
- Uses semantic HTML and avoids inline styles.

### 7.2 AI slop in Vue/Nuxt

| Pattern | Why it is slop | Proposed rule |
|---------|----------------|---------------|
| Options API in a Vue 3 project | Legacy pattern | `logic/options-api-legacy` |
| `onMounted` data fetching when `useFetch` would work | Suboptimal SSR | `logic/client-fetch-nuxt` |
| `v-for` without `:key` | Reconciliation bugs | `logic/key-prop-missing` (adapt) |
| Inline styles in templates | Bypasses scoped CSS / tokens | `visual/inline-style` |
| Giant `<script setup>` with mixed concerns | Hard to test/reuse | `component/giant-component` |

---

## 8. Svelte and SvelteKit

### 8.1 Mental model

Svelte 5 introduced runes (`$state`, `$derived`, `$effect`, `$props`, `$bindable`), replacing Svelte 4's `writable()` stores, `export let` props, and `$:` reactive declarations. SvelteKit uses file-based routing, `+page.server.ts` for server data, form actions, and `load` functions.

Production-grade Svelte 5 code:

- Uses runes, not legacy stores/reactive declarations.
- Fetches data in `+page.server.ts` or `+layout.server.ts`, not `onMount`.
- Uses snippets (`{@render children()}`) instead of slots.
- Uses `.svelte.ts` modules for reusable reactive state.

### 8.2 AI slop in Svelte/SvelteKit

| Pattern | Why it is slop | Proposed rule |
|---------|----------------|---------------|
| `export let name` for props | Svelte 4 syntax | `logic/svelte-legacy-props` |
| `$: doubled = count * 2` | Should be `$derived` | `logic/svelte-legacy-reactive` |
| `writable()` store in Svelte 5 | Should be `$state` | `logic/svelte-legacy-store` |
| `onMount(() => fetch(...))` | Should use `load` | `logic/useeffect-fetch` (adapt) |
| `{#each items as item}` without key | Reconciliation bugs | `logic/key-prop-missing` (adapt) |

---

## 9. SolidJS and Qwik

### 9.1 SolidJS mental model

SolidJS uses fine-grained reactivity with signals (`createSignal`) and JSX. It has no virtual DOM; updates are compiled to precise DOM operations.

Production-grade Solid code:

- Uses signals and stores for state.
- Avoids destructuring reactive props in a way that loses reactivity.
- Uses `Show`, `For`, `Switch` control flow components.

### 9.2 Qwik mental model

Qwik uses resumability instead of hydration. Components serialize state into HTML, and JavaScript is loaded only when the user interacts.

Production-grade Qwik code:

- Uses `$` suffixes for lazy-loaded handlers (`onClick$`).
- Avoids top-level imports of heavy libraries.
- Avoids global mutable state that cannot be serialized.
- Uses `useStore` for serializable state.

### 9.3 AI slop in Solid/Qwik

| Pattern | Why it is slop | Proposed rule |
|---------|----------------|---------------|
| `const { value } = props` in Solid | Destructuring breaks reactivity | `logic/solid-reactive-destructure` |
| `window.foo = ...` in Qwik | Cannot be serialized/resumed | `logic/qwik-global-state` |
| Top-level heavy import in Qwik | Defeats lazy loading | `perf/qwik-eager-import` |
| `onClick={() => ...}` without `$` | Misses resumability | `logic/qwik-handler-missing-$` |

---

## 10. Library-agnostic AI slop patterns

Some patterns are bad regardless of framework. These should be the highest-priority rules.

### 10.1 Logic slop

| Pattern | Proposed rule | Severity |
|---------|---------------|----------|
| `useEffect` + `useState` for data fetching | `logic/useeffect-fetch` | high |
| `fetch()` without `AbortSignal` / `.ok` / typed errors | `logic/raw-fetch` | high |
| `onClick={() => doAsync()}` without `await` / `catch` | `logic/floating-promise` | high |
| `// eslint-disable-next-line react-hooks/exhaustive-deps` | `logic/exhaustive-deps-disable` | high |
| `useEffect` without dependency array | `logic/missing-effect-deps` | high |
| Conditional or looped hook calls | `logic/conditional-hook` | critical |
| `key={index}` | `logic/key-prop-index` | medium |
| Missing `key` in `.map()` | `logic/key-prop-missing` | high |
| Inline objects/functions passed to memoized children | `logic/memo-breaker` | medium |
| Direct DOM queries (`document.getElementById`) | `logic/direct-dom-query` | medium |
| Mutating props or state values | `logic/mutating-props` | medium |

### 10.2 Visual / design-system slop

| Pattern | Proposed rule | Severity |
|---------|---------------|----------|
| Magic spacing values | `visual/magic-number-spacing` | medium |
| `!important` / `!` utilities | `visual/important-override` | medium |
| Arbitrary z-index ladder | `visual/z-index-ladder` | low |
| Hardcoded shadows | `visual/non-token-shadow` | low |
| Hardcoded radii | `visual/non-token-radius` | low |
| Hardcoded borders | `visual/non-token-border` | low |
| Magic breakpoints | `visual/breakpoint-hardcode` | medium |
| Gradient soup / AI landing page look | `visual/gradient-soup` | low |

### 10.3 Component slop

| Pattern | Proposed rule | Severity |
|---------|---------------|----------|
| Component files > 200 lines or > 7 JSX branches | `component/giant-component` | medium |
| Components with > 7 props | `component/props-interface-bloat` | low |
| Near-identical components across files | `component/duplicated-component` | medium |

### 10.4 Performance slop

| Pattern | Proposed rule | Severity |
|---------|---------------|----------|
| Images without dimensions or `loading="lazy"` | `perf/unoptimized-images` | medium |
| Data fetching without Suspense boundary | `perf/missing-suspense-boundary` | medium |
| Objects/arrays in `useEffect`/`useMemo` deps | `perf/object-array-deps` | medium |
| Heavy imports (`lodash`, `moment`) | `perf/bloated-imports` | medium |
| Animations ignoring `prefers-reduced-motion` | `perf/reduced-motion` / `wcag/motion-no-prefers` | low |

### 10.5 Accessibility slop

| Pattern | Proposed rule | Severity |
|---------|---------------|----------|
| `<img>` without `alt` | `wcag/missing-alt` | high |
| Form inputs without associated label | `wcag/missing-label` | high |
| `<div onClick>` without button role | `wcag/non-semantic-button` | high |
| Skipped heading levels | `wcag/heading-order` | medium |
| Redundant ARIA | `wcag/aria-redundant` | low |
| Animations not respecting reduced motion | `wcag/motion-no-prefers` | medium |

### 10.6 Architecture slop

| Pattern | Proposed rule | Severity |
|---------|---------------|----------|
| Exports with no importers | `arch/dead-code` | medium |
| Duplicate utility implementations | `arch/duplicate-utility` | medium |
| Multiple libraries for the same UI concern | `arch/duplicated-dependency` | low |
| Hardcoded secrets | `arch/hardcoded-secrets` / `security/hardcoded-secrets` | critical |
| Non-localhost HTTP URLs | `arch/http-not-https` / `security/insecure-url` | high |

---

## 11. AI copy detection

AI-generated text in UI components is a distinct signal from code quality. LLMs produce recognizable patterns:

### 11.1 Placeholder and filler text

- `Lorem ipsum`, `dolor sit amet`
- `This is a sample description`
- `Your text here`
- `Coming soon`
- `Content goes here`

Existing rule: `typo/placeholder-text`.

### 11.2 Generic CTAs and marketing fluff

- `Learn more`, `Get started`, `Discover the power of`, `Unlock your potential`
- `Revolutionize your workflow`, `Empower your team`, `Seamless experience`
- ` cutting-edge`, `innovative`, `robust`, `scalable`, `streamlined`

### 11.3 Sycophancy and hedging phrases

- `I hope this helps!`, `Feel free to ask if you have any questions`
- `It's important to note that...`, `It's worth mentioning that...`
- `In conclusion`, `Ultimately`, `At the end of the day`

### 11.4 AI buzzword clusters

- `AI-powered`, `leverage AI`, `harness the power of`, `state-of-the-art`
- `synergy`, `holistic`, `paradigm shift`, `game-changer`

### 11.5 Proposed copy rules

| Rule | Detects | Severity |
|------|---------|----------|
| `typo/placeholder-text` (exists) | Lorem ipsum, sample text | low |
| `typo/ai-generic-cta` | Generic CTAs repeated across components | low |
| `typo/ai-marketing-fluff` | Buzzword-heavy marketing strings | low |
| `typo/ai-sycophancy` | Hedging / sycophancy phrases | info |
| `typo/hardcoded-strings` (proposed) | Raw strings that should be i18n keys | info |

---

## 12. Framework detection matrix for `slopbrick`

The current `detectStack` function already identifies react-native, expo, next, astro, qwik, svelte, vue, solid, react. It should be extended to detect:

| Library / framework | Detection signal | Rule implications |
|---------------------|------------------|-------------------|
| Tamagui | `tamagui` in dependencies | Inline props are first-class; flag raw literals, not inline props themselves |
| NativeWind | `nativewind` in dependencies | Treats Tailwind classes as RN styles; arbitrary values are still slop |
| shadcn/ui | `class-variance-authority`, `radix-ui`, `@radix-ui/*`, tailwind + copied components | Stronger focus on composition, variants, theme variables |
| MUI | `@mui/material` | `sx` prop is valid; flag raw literals inside `sx` |
| Chakra | `@chakra-ui/react` | Style props are valid; flag dynamic conditional style props in Panda mode |
| Panda | `@pandacss/dev` | Build-time extraction; flag dynamic style props |
| Styled Components | `styled-components` | Maintenance-mode warning; flag hardcoded literals |
| Emotion | `@emotion/react`, `@emotion/styled` | Similar to styled-components but still maintained |

---

## 13. Scoring and flywheel implications

The `looped` audit showed that 76% of files scored 0 because the current rule set is dominated by visual rules and lacks logic/component/perf rules. Adding the missing rules will:

- Surface slop in the currently silent 0-score files.
- Raise the mean file score and make the Slop Index correlate better with actual cleanup work.
- Reduce the dilution effect where hundreds of high-severity issues are hidden behind a low project average.

Framework-aware tuning will:

- Reduce false positives in React Native / Tamagui projects.
- Improve the signal-to-noise ratio of the visual category.
- Prevent the same inline style from being double-counted by `visual/inline-style` and `logic/style-sheet-avoidance`.

Flywheel ingestion can be extended to:

- Auto-tune default severities based on recurring top violations.
- Suggest new rules when telemetry shows repeated patterns not covered by existing rules.
- Track chronic offender files across scans.

---

## 14. AI visual design clichés (the "AI slop" aesthetic)

LLM-generated UIs converge on a small set of safe, statistically common choices. The phenomenon is well-documented: "AI slop" designs are instantly recognizable because they are the median of every Tailwind tutorial scraped from 2019–2024 [^16^].

### 14.1 Common AI color choices

| Pattern | Why it signals AI slop | Detection approach |
|---------|------------------------|--------------------|
| Purple / indigo / violet gradients (`#8b5cf6`, `#6366f1`, `#a855f7`) | Tailwind's default demo color became the LLM default | Regex / allowlist of overused hexes |
| Blue-to-purple gradients on white | The canonical "AI landing page" look | Gradient literal detection |
| Timid, evenly-distributed palettes | No dominant color or sharp accent | Count distinct colors, flag low variance |
| Pure black / pure white extremes | Safe defaults instead of nuanced neutrals | Flag `#000000`, `#ffffff` in large areas |
| `rgba(0,0,0,0.1)` shadows | The default "subtle shadow" | Regex for low-opacity black shadows |
| Rainbow gradients without brand reason | Decorative filler | Detect multi-stop gradients |

Adam Wathan's public apology for making Tailwind UI default to `bg-indigo-500` illustrates how a single training-data bias became a universal LLM default [^16^].

### 14.2 Common AI font choices

| Font | Why it signals AI slop | Detection |
|------|------------------------|-----------|
| Inter | The default "modern" sans in most examples | `font-family` literal match |
| Roboto / Open Sans / Lato | Safe Google Fonts defaults | Literal match |
| Arial / system-ui | Fallback defaults | Literal match |
| Space Grotesk | Became the new post-Inter default | Literal match |
| Single font everywhere | No pairing, no hierarchy | Count font-family declarations |

Production-grade design typically uses intentional pairings (display + body, serif + sans, variable font weight extremes). AI-generated code tends to use one "safe" font across the entire app.

### 14.3 Common AI layout / component clichés

| Pattern | Why it signals AI slop | Detection |
|---------|------------------------|-----------|
| Hero with centered headline + subheadline + CTA | The default landing-page template | DOM structure heuristic |
| Three feature boxes with icons in a row | The canonical SaaS feature grid | Count of sibling cards with icons |
| Rounded corners on every element | Default Tailwind radius overuse | High ratio of `rounded-*` classes |
| Large generic hero illustration | Stock/generated image placeholder | Image alt / filename patterns |
| Excessive gradient backgrounds | Decorative noise without purpose | Count gradient declarations |
| Cookie-consent banner + chat widget + newsletter modal | Boilerplate plugin stack | Detect common third-party scripts |

### 14.4 Proposed visual cliché rules

| Rule | Detects | Severity |
|------|---------|----------|
| `visual/ai-default-color` | Overused AI colors (indigo/purple/blue gradients) | low |
| `visual/ai-generic-font` | Inter/Roboto/system fonts as the only font | low |
| `visual/ai-gradient-soup` | Excessive decorative gradients | low |
| `visual/ai-hero-cliche` | Centered hero + three feature boxes | low |
| `visual/ai-shadow-opacity` | Low-opacity black shadows repeated | info |
| `visual/low-color-variance` | Palette with no dominant accent | info |

These rules are opinionated and low-severity. They should be opt-in or weighted lightly, but they are valuable for branding and design-system audits.

---

## 15. Better math for calculating AI slop

The `looped` audit revealed a scoring bug: 566 issues (367 high-severity) produced a Slop Index of only **8.8** and a Health of **91**. The current formula averages per-file scores and then applies a size-normalization factor. Averaging hides hotspots, and size normalization over-dilutes large projects.

### 15.1 What "slop" actually is

For `slopbrick`, slop is a **deviation from the framework's production-grade mental model**, weighted by:

- **Severity** of the pattern (critical > high > medium > low > info).
- **Category weight** (visual, logic, perf, wcag, component, arch, typo).
- **Framework context** (a pattern may be neutral or expected in RN/Tamagui but slop in Tailwind).
- **Density** (issues per component or per 100 lines, to compare small and large files fairly).
- **Recurrence** (chronic offenders vs. one-off mistakes).

### 15.2 Lessons from code-quality metrics

The software-metrics literature offers proven patterns [^17^][^18^][^19^]:

- **Maintainability Index (MI)**: `MI = MAX(0, (171 - 5.2*ln(Halstead Volume) - 0.23*Cyclomatic Complexity - 16.2*ln(LOC)) * 100 / 171)`. It blends size, complexity, and volume into a 0–100 score.
- **Technical Debt Score**: weighted points per 100 logical lines. Error = 3, warning = 1, info = 0.5.
- **Power-law distributions**: Averages mask high-risk outliers. Use percentiles (p90, p95, max) and outlier detection.
- **Logarithmic decay**: `score = 100 - k * log(1 + density)` prevents a single huge file from swamping the index.

### 15.3 Proposed new scoring model

Replace the current mean-based index with a composite that reflects **total cleanup effort**:

#### Step 1: severity weights

| Severity | Weight |
|----------|--------|
| critical | 8 |
| high | 4 |
| medium | 2 |
| low | 1 |
| info | 0.25 |

#### Step 2: per-file weighted slop score

```text
fileWeightedPoints = Σ(issue_count(rule) * severityWeight(rule) * categoryWeight(category))
fileDensity        = fileWeightedPoints / max(1, componentCountInFile)
fileSlopScore      = min(100, fileDensity * densityMultiplier)
```

The `densityMultiplier` should be calibrated so that a file with ~5 medium-severity issues per component scores around 50.

#### Step 3: project-level composite

Instead of only `(mean + 0.5*p90) / 1.5 * sizeNorm`, use:

```text
meanScore      = mean(fileSlopScore)
p90Score       = p90(fileSlopScore)
peakScore      = max(fileSlopScore)
totalDensity   = totalWeightedPoints / totalComponents
totalScore     = min(100, totalDensity * totalDensityMultiplier)

slopIndex      = 0.35*meanScore + 0.25*p90Score + 0.20*peakScore + 0.20*totalScore
```

This prevents silent files from hiding severe hotspots, because `peakScore` and `totalScore` are explicitly included.

#### Step 4: size normalization that does not over-dilute

Current normalization shrinks the index for large projects. A better approach:

- Cap the normalization factor (e.g., never below 0.6) so large projects still reflect real slop.
- Or remove normalization from the index and instead report a separate "scale factor".
- Use `totalScore` (weighted points per component) which is intrinsically scale-invariant.

#### Step 5: category scores that match rule density

Current category scores appear low because they are averages. Compute category scores as:

```text
categoryScore = min(100, weightedPoints(category) / totalComponents * multiplier)
```

This makes the visual/logic/perf scores comparable to the overall index.

#### Step 6: Health that is not just `100 - slopIndex`

Health should reflect the **expected remaining cleanup effort**, not a simple inverse:

```text
health = max(0, 100 - slopIndex)
```

is acceptable, but thresholds should be calibrated so that:

- Slop Index > 50 → Health < 50 (poor).
- Slop Index 25–50 → Health 50–75 (needs work).
- Slop Index < 25 → Health > 75 (good).

### 15.4 What counts as "slop" vs. "noise"

Not every rule violation is equal. The scoring model should distinguish:

1. **Structural slop** (high impact): hook rules broken, security issues, missing keys, accessibility failures.
2. **Token drift** (medium impact): hardcoded colors, magic spacing, non-token shadows.
3. **Aesthetic clichés** (low impact): default fonts, purple gradients, generic layouts.
4. **Framework-expected patterns** (no impact in that framework): inline props in Tamagui, `StyleSheet` not required for one-offs in RN.

The severity weights and framework overrides encode this distinction.

### 15.5 Validation approach

Before shipping the new scoring model:

1. Run it against `looped` and `lm` and confirm the index rises from ~9 to a value that reflects the 367 high-severity issues.
2. Run it against a clean project and confirm it stays near 0.
3. Run it against a project with one terrible file and confirm the peak component pulls the index up.
4. Expose the four sub-scores (`mean`, `p90`, `peak`, `total`) in the report so users can see why the index changed.

---

## 16. Unified recommendations for `slopbrick`

### Rules to add (priority order)

1. **Framework-aware rule engine**: extend `detectStack` and allow rules to read `framework`, `hasTailwind`, `supportsRsc`, and a new `uiLibraries` array.
2. **RN/Tamagui tuning**: turn off/downgrade `visual/inline-style` and `visual/raw-style-values` for native stacks; add Tamagui prop-style extraction to the visitor.
3. **High-impact logic rules**: `logic/key-prop-index`, `logic/event-handler-inline`, `logic/useeffect-fetch`, `logic/direct-dom-query`, `logic/floating-promise`, `logic/explicit-any`, `logic/non-null-assertion`.
4. **Component rules**: `component/giant-component`, extended `component/duplicated-component`.
5. **Performance rules**: `perf/unoptimized-images`, `perf/object-array-deps`, `perf/bloated-imports`, `perf/reduced-motion`.
6. **Accessibility rules**: `wcag/missing-alt`, `wcag/missing-label`, `wcag/non-semantic-button`, `wcag/heading-order`.
7. **AI copy rules**: `typo/ai-generic-cta`, `typo/ai-marketing-fluff`, `typo/ai-sycophancy`.
8. **AI visual cliché rules**: `visual/ai-default-color`, `visual/ai-generic-font`, `visual/ai-gradient-soup`, `visual/ai-hero-cliche`.

### Scoring changes

1. Add explicit severity weights.
2. Add `totalScore` (weighted points per component) to the index.
3. Add `peakScore` so single bad files cannot be hidden.
4. Cap or remove the size-normalization floor.
5. Expose sub-scores in the report.

### Flywheel behavior

1. Auto-tune rule severity when a violation is a chronic top offender.
2. Generate rule-backlog suggestions from uncaught telemetry patterns.
3. Track chronic offender files across scans.

---

## 17. Recommended implementation order

1. **Framework-aware visual rules** — fix RN/Tamagui noise immediately.
2. **Scoring calibration** — apply severity weights and composite index.
3. **High-impact logic rules** — `logic/key-prop-index`, `logic/event-handler-inline`, `logic/useeffect-fetch`, `logic/direct-dom-query`, `logic/floating-promise`.
4. **Component rules** — `component/giant-component`, extended `component/duplicated-component`.
5. **Performance rules** — `perf/unoptimized-images`, `perf/object-array-deps`, `perf/bloated-imports`.
6. **Accessibility rules** — `wcag/missing-alt`, `wcag/missing-label`, `wcag/non-semantic-button`.
7. **AI copy rules** — `typo/ai-generic-cta`, `typo/ai-marketing-fluff`, `typo/ai-sycophancy`.
8. **AI visual cliché rules** — `visual/ai-default-color`, `visual/ai-generic-font`, `visual/ai-gradient-soup`.
9. **Framework detection extensions** — Tamagui, NativeWind, MUI, Chakra, Panda, Styled Components, Emotion.
10. **Flywheel behavior** — auto-tune weights, hotspot rules, rule backlog generator.

---

## References

[^1^]: Tamagui Docs — "View & Text", https://tamagui.dev/docs/core/stack-and-text
[^2^]: Sanity.io — "styled-components maintenance mode: A 40% faster fork", https://www.sanity.io/blog/cut-styled-components-into-pieces-this-is-our-last-resort
[^3^]: LogRocket — "React Native styling tutorial with examples", https://blog.logrocket.com/react-native-styling-tutorial-examples/
[^4^]: State of React Native — Styling, https://results.stateofreactnative.com/en-US/styling/
[^5^]: Tailwind CSS Best Practices GitHub, https://github.com/ofershap/tailwind-best-practices
[^6^]: shadcn/ui vs Radix UI comparison, https://www.mgsoftware.nl/en/vergelijking/shadcn-vs-radix-ui
[^7^]: MUI Customization guide, https://www.uxpin.com/studio/blog/mui-customization/
[^8^]: Chakra UI Styling Performance, https://chakra-ui.com/guides/styling-performance
[^9^]: Panda CSS LogRocket guide, https://blog.logrocket.com/creating-type-safe-styles-panda-css/
[^10^]: SvelteKit Best Practices, https://github.com/ofershap/sveltekit-best-practices
[^11^]: Qwik Resumability, https://www.learn-qwik.com/blog/qwik-2025/
[^12^]: React Server Components patterns.dev, https://www.patterns.dev/react/react-server-components/
[^13^]: SitePoint — "AI Is Not Your Accessibility Expert", https://www.sitepoint.com/ai-is-not-your-accessibility-expert-what-llms-still-miss-about-wcag/
[^14^]: LogRocket — "AI has an accessibility problem", https://blog.logrocket.com/ai-has-an-accessibility-problem/
[^15^]: arXiv — "Debt Behind the AI Boom", https://arxiv.org/html/2603.28592v1
[^16^]: PRG.sh — "Why Your AI Keeps Building the Same Purple Gradient Website", https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website
[^17^]: Sourcery.ai — "Maintainability Index — What is it and where does it fall short?", https://www.sourcery.ai/blog/maintainability-index
[^18^]: BlueGrid — "Maintainability index", https://bluegrid.io/glossary/software-development/maintainability-index/
[^19^]: PhpCodeArcheology — "Project-Level Scores", https://github.com/PhpCodeArcheology/PhpCodeArcheology/blob/main/docs/metrics.md
