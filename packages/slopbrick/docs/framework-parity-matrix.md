# Framework Parity Matrix

This matrix documents how each built-in `slopbrick` rule behaves across the supported web frameworks: React, Vue, Svelte, Solid, and Astro. ✅ means the rule reports issues from script-level code and JSX/TSX templates where applicable. ⚠️ means the rule works for script-level code but misses template-only issues because Vue/Svelte/Astro template extraction is currently limited.

> Note: `slopbrick` also supports React Native, Expo, and Qwik, but those stacks are outside the scope of this matrix.

The matrix covers all built-in and project-level rules, including rules that are disabled by default. A rule marked ✅ for a framework means it will report issues when enabled, not that it is enabled by default. Refer to `DEFAULT_CONFIG.rules` and framework presets for default severities. The matrix also reflects the framework presets in `src/config.ts`.

## Matrix

| Rule | React | Vue | Svelte | Solid | Astro | Notes |
|------|-------|-----|--------|-------|-------|-------|
| `visual/arbitrary-escape` | ✅ | ✅ | ✅ | ✅ | ✅ | Works on script/AST-level class strings and style objects. |
| `visual/clamp-soup` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Depends on `styleProps`; template style-prop extraction is limited for Vue/Svelte/Astro. |
| `visual/forced-layout` | ✅ | ✅ | ✅ | ✅ | ✅ | Flags layout-forcing style values in script blocks. |
| `visual/generic-centering` | ✅ | ✅ | ✅ | ✅ | ✅ | Detects repeated generic centering utilities. |
| `visual/inline-style` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Depends on `styleProps` (mostly JSX/script style objects). |
| `visual/raw-style-values` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Depends on `styleProps`; template style-prop extraction is limited for Vue/Svelte/Astro. |
| `visual/hardcoded-color` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Depends on `styleProps`. |
| `visual/magic-number-spacing` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Depends on `styleProps`; template style-prop extraction is limited for Vue/Svelte/Astro. |
| `visual/important-override` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Depends on `styleProps`; template style-prop extraction is limited for Vue/Svelte/Astro. |
| `visual/breakpoint-hardcode` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Depends on `styleProps`; template style-prop extraction is limited for Vue/Svelte/Astro. |
| `logic/boundary-violation` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Depends on `components` containing JSX. |
| `logic/qwik-hook-leak` | N/A | N/A | N/A | N/A | N/A | Qwik-specific rule; only fires when Qwik is detected. |
| `logic/reactive-hook-soup` | ✅ | N/A | N/A | N/A | N/A | React-specific rule; only inspects React `useEffect`/`useState` patterns, so it is a no-op on other frameworks. |
| `logic/zombie-state` | ✅ | N/A | N/A | N/A | N/A | React-specific rule; only inspects React `useEffect`/`useState` patterns, so it is a no-op on other frameworks. |
| `logic/ghost-defensive` | ✅ | ✅ | ✅ | ✅ | ✅ | Detects defensive code that never executes. |
| `logic/style-sheet-avoidance` | N/A | N/A | N/A | N/A | N/A | React Native / Expo-specific rule; only fires when React Native/Expo is detected. |
| `logic/console-log` | ✅ | ✅ | ✅ | ✅ | ✅ | Detects stray `console.log` calls. |
| `logic/conditional-hook` | ✅ | ❌ | ❌ | ❌ | ❌ | React-only hook rule; disabled by framework preset elsewhere. |
| `logic/useeffect-fetch` | ✅ | ❌ | ❌ | ❌ | ❌ | Detects raw `useEffect` + fetch patterns. |
| `logic/raw-fetch` | ✅ | ✅ | ✅ | ✅ | ✅ | Flags unwrapped `fetch` calls in script code. |
| `logic/exhaustive-deps-disable` | ✅ | ❌ | ❌ | ❌ | ❌ | React `useEffect` eslint-disable rule; disabled elsewhere. |
| `logic/missing-effect-deps` | ✅ | ❌ | ❌ | ❌ | ❌ | React `useEffect` dependency rule; disabled elsewhere. |
| `logic/optimistic-no-rollback` | ✅ | ✅ | ✅ | ✅ | ✅ | Detects optimistic updates without rollback logic. |
| `logic/mutating-props` | ✅ | ✅ | ✅ | ✅ | ✅ | Flags direct prop mutation in script code. |
| `logic/memo-breaker` | ✅ | ❌ | ❌ | ❌ | ❌ | React `useMemo`/`React.memo` rule; disabled elsewhere. |
| `logic/prop-drilling` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Depends on component prop drilling analysis. |
| `security/dangerously-set-inner-html` | ✅ | ✅ | ✅ | ⚠️ | ✅ | Cross-framework raw HTML detection: React `dangerouslySetInnerHTML`, Vue `v-html`, Svelte `{@html}`, Astro `set:html`. |
| `security/eval` | ✅ | ✅ | ✅ | ✅ | ✅ | Detects `eval` and equivalent calls. |
| `security/hardcoded-secrets` | ✅ | ✅ | ✅ | ✅ | ✅ | Flags hardcoded secrets in script/strings. |
| `security/insecure-url` | ✅ | ✅ | ✅ | ✅ | ✅ | Detects insecure URL patterns in script code. |
| `perf/missing-suspense-boundary` | ✅ | ❌ | ❌ | ❌ | ❌ | React Suspense rule; disabled by preset elsewhere. |
| `typo/placeholder-text` | ✅ | ✅ | ✅ | ✅ | ✅ | Detects placeholder copy in script-level strings. |
| `typo/hardcoded-strings` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Script-level strings are caught; JSX/template text and attribute literals may be missed for Vue/Svelte/Astro. |
| `wcag/target-size` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Inspects rendered elements; Vue/Svelte templates remain partially extracted. Astro partial template extraction: `<img>`, `<h1>`–`<h6>`, `<input>`, `<button>`, `<a>` are now extracted, but complex/nested cases may still be missed. |
| `wcag/focus-appearance` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Inspects rendered elements; Vue/Svelte templates remain partially extracted. Astro partial template extraction: `<img>`, `<h1>`–`<h6>`, `<input>`, `<button>`, `<a>` are now extracted, but complex/nested cases may still be missed. |
| `wcag/focus-obscured` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Inspects rendered elements; Vue/Svelte templates remain partially extracted. Astro partial template extraction: `<img>`, `<h1>`–`<h6>`, `<input>`, `<button>`, `<a>` are now extracted, but complex/nested cases may still be missed. |
| `wcag/dragging-movements` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Inspects rendered elements; Vue/Svelte templates remain partially extracted. Astro partial template extraction: `<img>`, `<h1>`–`<h6>`, `<input>`, `<button>`, `<a>` are now extracted, but complex/nested cases may still be missed. |
| `wcag/color-contrast` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Inspects rendered elements; Vue/Svelte templates remain partially extracted. Astro partial template extraction: `<img>`, `<h1>`–`<h6>`, `<input>`, `<button>`, `<a>` are now extracted, but complex/nested cases may still be missed. |
| `wcag/missing-alt` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Inspects rendered `<img>` elements; Vue/Svelte templates remain partially extracted. Astro partial template extraction: `<img>`, `<h1>`–`<h6>`, `<input>`, `<button>`, `<a>` are now extracted, but complex/nested cases may still be missed. |
| `wcag/missing-label` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Inspects rendered interactive elements; Vue/Svelte templates remain partially extracted. Astro partial template extraction: `<img>`, `<h1>`–`<h6>`, `<input>`, `<button>`, `<a>` are now extracted, but complex/nested cases may still be missed. |
| `typo/calc-raw-px` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Depends on `styleProps`; template style-prop extraction is limited for Vue/Svelte/Astro. |
| `typo/calc-fontsize` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Depends on `styleProps`; template style-prop extraction is limited for Vue/Svelte/Astro. |
| `typo/clamp-offscale` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Depends on `styleProps`; template style-prop extraction is limited for Vue/Svelte/Astro. |
| `perf/cls-image` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | `imageElements` are populated from JSX/TSX `<img>` tags; Vue/Svelte templates remain partially extracted. Astro partial template extraction: `<img>`, `<h1>`–`<h6>`, `<input>`, `<button>`, `<a>` are now extracted, but complex/nested cases may still be missed. |
| `layout/gap-monopoly` | ✅ | ✅ | ✅ | ✅ | ✅ | Detects gap-only layout patterns in script code. |
| `layout/duplicated-screen` | ✅ | ✅ | ✅ | ✅ | ✅ | Flags duplicated screen layouts in script/AST code. |
| `component/duplicated-component` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Component and element extraction is partial for Vue/Svelte/Astro; duplicates inside templates may be missed. |
| `perf/css-bloat` | ✅ | ✅ | ✅ | ✅ | ✅ | Flags CSS bloat patterns in script/style code. |
| `component/shadcn-prop-mismatch` | ✅ | N/A | N/A | N/A | N/A | Only reports when shadcn/ui is detected; otherwise does not apply. |
| `arch/astro-island-leak` | N/A | N/A | N/A | N/A | ✅ | Astro-specific island architecture rule; only fires when Astro islands are present. |
| `layout/spacing-grid` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Depends on `styleProps`; template style-prop extraction is limited for Vue/Svelte/Astro. |
| `typo/ai-generic-cta` | ✅ | ✅ | ✅ | ✅ | ✅ | Flags generic AI-generated CTA copy. |
| `typo/ai-marketing-fluff` | ✅ | ✅ | ✅ | ✅ | ✅ | Detects AI marketing fluff in strings. |
| `typo/ai-sycophancy` | ✅ | ✅ | ✅ | ✅ | ✅ | Flags sycophantic AI-generated copy. |
| `visual/ai-default-color` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Depends on `styleProps`; template style-prop extraction is limited for Vue/Svelte/Astro. |
| `visual/ai-generic-font` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Depends on `styleProps`; template style-prop extraction is limited for Vue/Svelte/Astro. |
| `visual/ai-gradient-soup` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Depends on `styleProps`; template style-prop extraction is limited for Vue/Svelte/Astro. |
| `visual/ai-hero-cliche` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Depends on `allElements` (JSX elements). |
| `component/giant-component` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | General component size rule; works on all frameworks that parse components. React/Solid JSX components are detected reliably; Vue/Svelte/Astro component detection may vary. |
| `logic/direct-dom-query` | ✅ | ✅ | ✅ | ✅ | ✅ | General; works for all frameworks where DOM query methods appear in script. |
| `logic/event-handler-inline` | ✅ | ❌ | ❌ | ✅ | ❌ | JSX-specific inline handler detection. React/Solid use JSX, so inline handlers are detected; Vue/Svelte/Astro templates are not parsed for inline handlers. |
| `logic/explicit-any` | ✅ | ✅ | ✅ | ✅ | ✅ | General TypeScript; works for all frameworks where `.ts`/`.tsx`/`.vue`/`.svelte` files are parsed. |
| `logic/floating-promise` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Depends on `inlineEventHandlers` (JSX inline handlers). |
| `logic/key-prop-index` | ✅ | ❌ | ❌ | ❌ | ❌ | React-only `key` prop rule; disabled by framework preset elsewhere. |
| `logic/key-prop-missing` | ✅ | ❌ | ❌ | ❌ | ❌ | React-only `key` prop rule; disabled by framework preset elsewhere. |
| `logic/non-null-assertion` | ✅ | ✅ | ✅ | ✅ | ✅ | General TypeScript; works for all frameworks where TypeScript is parsed. |
| `perf/bloated-imports` | ✅ | ✅ | ✅ | ✅ | ✅ | General import analysis; works for all frameworks. |
| `perf/object-array-deps` | ✅ | ❌ | ❌ | ❌ | ❌ | React hook dependency rule (`useEffect`/`useMemo`/`useCallback`); disabled by framework preset elsewhere. |
| `perf/reduced-motion` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Depends on `styleProps`; template style-prop extraction is limited for Vue/Svelte/Astro. |
| `perf/unoptimized-images` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Image optimization rule. React/Solid JSX image tags are extracted; Vue/Svelte/Astro template `<img>` tags are not fully extracted. |
| `wcag/heading-order` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Heading order rule. React/Solid JSX headings are extracted; Vue/Svelte templates remain partially extracted. Astro partial template extraction: `<img>`, `<h1>`–`<h6>`, `<input>`, `<button>`, `<a>` are now extracted, but complex/nested cases may still be missed. |
| `wcag/non-semantic-button` | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Button semantics rule. React/Solid JSX buttons are extracted; Vue/Svelte templates remain partially extracted. Astro partial template extraction: `<img>`, `<h1>`–`<h6>`, `<input>`, `<button>`, `<a>` are now extracted, but complex/nested cases may still be missed. |

## Key

| Symbol | Meaning |
|--------|---------|
| ✅ | Works for script-level code and JSX/TSX templates. |
| ⚠️ | Works for script-level code, but template-level facts (style props, elements, inline handlers, JSX text) are not fully extracted for Vue/Svelte, or are only partially extracted for Astro. |
| ❌ | Disabled via the framework preset for that framework. |
| N/A | Framework-specific rule that is effectively a no-op or does not apply. |

> **Template extraction caveat**: For Vue/Svelte, the visitor currently extracts script blocks and static `class` attributes, but does not fully extract element tags/attributes, inline `style` props, inline event handlers, or JSX text/attribute literals. Astro templates now have partial extraction of `<img>`, `<h1>`–`<h6>`, `<input>`, `<select>`, `<textarea>`, `<button>`, `<a>`, and static classes, but complex/nested cases may still be missed. Rules that depend on unextracted template facts are marked ⚠️ for those frameworks.
>
> **Default severity**: Rules marked `off` in `DEFAULT_CONFIG.rules` are disabled by default for all frameworks. Framework presets may additionally disable React-specific rules for Vue/Svelte/Solid/Astro.

## Known limitations

- **Vue/Svelte templates are currently limited to script blocks and static class names.** The visitor parses `<script>` blocks from `.vue` and `.svelte` files and extracts static `class` attributes, but full template AST traversal is not yet implemented. As a result, rules that depend on element tags/attributes, inline `style` props, inline event handlers, JSX text/attribute literals, or component boundaries (for example `visual/inline-style`, `visual/hardcoded-color`, `visual/raw-style-values`, `visual/important-override`, `visual/magic-number-spacing`, `visual/breakpoint-hardcode`, `visual/clamp-soup`, `visual/ai-default-color`, `visual/ai-generic-font`, `visual/ai-gradient-soup`, `typo/calc-raw-px`, `typo/calc-fontsize`, `typo/clamp-offscale`, `typo/hardcoded-strings`, `layout/spacing-grid`, `perf/reduced-motion`, `component/duplicated-component`, `visual/ai-hero-cliche`, `logic/floating-promise`, `logic/boundary-violation`, `logic/prop-drilling`, and `wcag/*`) are marked ⚠️ for Vue and Svelte.
- **Astro template extraction has improved.** Phase 2 added extraction of `<img>`, `<h1>`–`<h6>`, `<input>`, `<select>`, `<textarea>`, `<button>`, `<a>`, and static classes from `.astro` templates. As a result, `wcag/*` and `perf/cls-image` now report Astro template issues in many common cases, but they remain marked ⚠️ because the extraction is regex-based and may miss complex or nested cases.
- **Solid JSX/TSX files are parsed fully.** Solid `.tsx`/`.jsx` files are parsed as JSX, so `allElements`/`imageElements`/`interactiveElements` are populated fully and rules that inspect rendered elements work correctly. Only Solid template syntax (`.solid` files or non-JSX templates) would have partial extraction, which is not currently supported.
- **`security/dangerously-set-inner-html` is now cross-framework.** The rule detects React `dangerouslySetInnerHTML`, Vue `v-html`, Svelte `{@html}`, and Astro `set:html`.
- **Framework presets override defaults.** When `slopbrick` detects a framework, it applies the corresponding preset from `FRAMEWORK_PRESETS` in `src/config.ts`. Rules in `REACT_ONLY_RULES` are turned off for Vue, Svelte, Solid, and Astro because they target React-specific APIs (`useEffect`, `useMemo`, Suspense, key props, shadcn/ui).
