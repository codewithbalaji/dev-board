# Design System

> The concrete layer: every design token as it exists in `src/index.css`, the Tailwind v4 CSS-first setup, the component inventory and its house authoring pattern, and the accessibility checklist.
>
> For *why* the interface looks and behaves the way it does, see [DESIGN.md](../DESIGN.md). Start at [AGENT.md](../AGENT.md).

**Status:** Tokens and `Button` exist today. Everything in [§7](#7-component-inventory) marked with a phase does not.

---

## 1. Stack

| Piece | Version | Where |
| :--- | :--- | :--- |
| Tailwind CSS | 4.3 | `@tailwindcss/vite` plugin, `src/index.css` |
| shadcn/ui | 4.21 | `components.json`, style `radix-luma`, base colour `neutral` |
| Radix UI | 1.6 | `radix-ui` (the unified package, not per-primitive) |
| `class-variance-authority` | 0.7 | Variant definitions |
| `lucide-react` | 1.41 | Icons |
| Inter Variable | `@fontsource-variable/inter` 5.3 | Self-hosted, bundled |
| `tw-animate-css` | 1.4 | Animation utilities |

---

## 2. Tailwind v4 is CSS-first — there is no config file

The single most important thing to know before touching styles: **`tailwind.config.js` does not exist and must not be created.** Tailwind v4 moved configuration into CSS. `src/index.css` *is* the config.

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "@fontsource-variable/inter";

@custom-variant dark (&:is(.dark *));

@theme inline {
    --font-heading: var(--font-sans);
    --font-sans: 'Inter Variable', sans-serif;
    --color-background: var(--background);
    /* …one --color-* per semantic token… */
    --radius-sm: calc(var(--radius) * 0.6);
    /* …the derived radius scale… */
}
```

Three mechanisms are at work, and confusing them is the usual source of "why isn't my class doing anything":

**`@theme inline { … }`** declares *design tokens that generate utility classes*. `--color-primary: var(--primary)` is what makes `bg-primary`, `text-primary`, and `border-primary` exist. If a utility class you expect is missing, it is because no `--color-*`/`--radius-*` entry generates it.

**`:root { … }` and `.dark { … }`** hold the *values*. These are ordinary CSS custom properties, not Tailwind constructs. They are indirected through `@theme inline` so that swapping `.dark` on `<html>` re-points every utility at once, without regenerating any CSS.

**`@custom-variant dark (&:is(.dark *))`** defines the `dark:` variant as class-based, not `prefers-color-scheme`-based. Theme is therefore controlled by adding or removing `.dark` on the root element — a deliberate choice that lets a user override their OS preference.

**Adding a token** means two edits: a value in both `:root` and `.dark`, plus a `--color-*` line in `@theme inline`. Miss the second and the value exists but no utility class does.

---

## 3. Colour tokens

The palette is **monochrome**. Every colour except `destructive` (and one dark-mode outlier, §3.3) has chroma `0` — pure greys expressed in oklch. This is not a placeholder to be replaced later; see [DESIGN.md](../DESIGN.md) for the reasoning.

oklch is `oklch(L C H)`: lightness `0`–`1`, chroma (saturation), hue in degrees. With `C = 0`, hue is irrelevant, which is why so many values read `0 0`.

### 3.1 Light — `:root`

| Token | Value | L | Role |
| :--- | :--- | ---: | :--- |
| `--background` | `oklch(1 0 0)` | 100% | Page ground. Pure white |
| `--foreground` | `oklch(0.145 0 0)` | 14.5% | Body text |
| `--card` | `oklch(1 0 0)` | 100% | Card surface — same as background; separation comes from `--border` |
| `--card-foreground` | `oklch(0.145 0 0)` | 14.5% | Text on cards |
| `--popover` | `oklch(1 0 0)` | 100% | Menus, dropdowns, dialogs |
| `--popover-foreground` | `oklch(0.145 0 0)` | 14.5% | Text in popovers |
| `--primary` | `oklch(0.205 0 0)` | 20.5% | Primary action fill — near-black |
| `--primary-foreground` | `oklch(0.985 0 0)` | 98.5% | Text on primary |
| `--secondary` | `oklch(0.97 0 0)` | 97% | Secondary fill |
| `--secondary-foreground` | `oklch(0.205 0 0)` | 20.5% | Text on secondary |
| `--muted` | `oklch(0.97 0 0)` | 97% | Subdued surface — hover rows, empty states |
| `--muted-foreground` | `oklch(0.556 0 0)` | 55.6% | Secondary text, timestamps, placeholders |
| `--accent` | `oklch(0.97 0 0)` | 97% | Hover/active surface |
| `--accent-foreground` | `oklch(0.205 0 0)` | 20.5% | Text on accent |
| `--destructive` | `oklch(0.577 0.245 27.325)` | 57.7% | **The only chromatic token.** Red, hue 27° |
| `--border` | `oklch(0.922 0 0)` | 92.2% | All hairlines |
| `--input` | `oklch(0.922 0 0)` | 92.2% | Form field borders |
| `--ring` | `oklch(0.708 0 0)` | 70.8% | Focus ring |
| `--radius` | `0.625rem` | — | 10 px base for the derived scale |

### 3.2 Dark — `.dark`

| Token | Value | Note |
| :--- | :--- | :--- |
| `--background` | `oklch(0.145 0 0)` | Not black — 14.5% |
| `--foreground` | `oklch(0.985 0 0)` | Not white — 98.5% |
| `--card` | `oklch(0.205 0 0)` | **Lighter than the page.** Elevation is expressed by lightness in dark mode, unlike light mode where card == background |
| `--card-foreground` | `oklch(0.985 0 0)` | |
| `--popover` | `oklch(0.205 0 0)` | |
| `--popover-foreground` | `oklch(0.985 0 0)` | |
| `--primary` | `oklch(0.922 0 0)` | **Inverted** — light fill, dark text |
| `--primary-foreground` | `oklch(0.205 0 0)` | |
| `--secondary` | `oklch(0.269 0 0)` | |
| `--secondary-foreground` | `oklch(0.985 0 0)` | |
| `--muted` | `oklch(0.269 0 0)` | |
| `--muted-foreground` | `oklch(0.708 0 0)` | Lighter than its light-mode counterpart, to hold contrast |
| `--accent` | `oklch(0.269 0 0)` | |
| `--accent-foreground` | `oklch(0.985 0 0)` | |
| `--destructive` | `oklch(0.704 0.191 22.216)` | Lighter and less saturated than light mode — required for legibility on a dark ground |
| `--border` | `oklch(1 0 0 / 10%)` | **Alpha, not opaque.** White at 10% adapts to whatever surface it sits on |
| `--input` | `oklch(1 0 0 / 15%)` | |
| `--ring` | `oklch(0.556 0 0)` | Darker than light mode; it sits against a dark ground |

Note the two structural inversions: **`--primary` flips** (dark fill in light mode, light fill in dark mode), and **borders become alpha values** so a hairline over a card and a hairline over the page both read correctly without separate tokens.

### 3.3 The one inconsistency — resolved

The shadcn preset shipped `--sidebar-primary` in dark mode as `oklch(0.488 0.243 264.376)`, a saturated blue-violet, while its light-mode counterpart was plain near-black. It was the only chromatic non-`destructive` value in the palette, and an artifact of the preset rather than a decision.

**Normalised to `oklch(0.922 0 0)`**, matching `--primary` in dark mode. The palette is now fully monochrome apart from `--destructive` in both themes, which is what makes red mean something ([DESIGN.md §1](../DESIGN.md#1-principles)). The sidebar's active-item treatment will use lightness and weight, like everything else.

`--sidebar-primary-foreground` was changed in the same edit, from `oklch(0.985 0 0)` to `oklch(0.205 0 0)`. The preset's near-white foreground only worked against the blue fill; against the new near-white fill it would have been white-on-white. **Any change to a `*-primary` token must move its `*-foreground` partner** — they are a contrast pair, and the light-mode pairing (dark fill / light text) inverts in dark mode (light fill / dark text).

### 3.4 Sidebar tokens

A parallel set so the sidebar can diverge from the main surface without overriding page-level tokens.

| Token | Light | Dark |
| :--- | :--- | :--- |
| `--sidebar` | `oklch(0.985 0 0)` | `oklch(0.205 0 0)` |
| `--sidebar-foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` |
| `--sidebar-primary` | `oklch(0.205 0 0)` | `oklch(0.922 0 0)` |
| `--sidebar-primary-foreground` | `oklch(0.985 0 0)` | `oklch(0.205 0 0)` |
| `--sidebar-accent` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` |
| `--sidebar-accent-foreground` | `oklch(0.205 0 0)` | `oklch(0.985 0 0)` |
| `--sidebar-border` | `oklch(0.922 0 0)` | `oklch(1 0 0 / 10%)` |
| `--sidebar-ring` | `oklch(0.708 0 0)` | `oklch(0.556 0 0)` |

### 3.5 Chart tokens

Five greys, identical in both themes — a lightness ramp rather than a hue ramp.

| Token | Value | L |
| :--- | :--- | ---: |
| `--chart-1` | `oklch(0.87 0 0)` | 87% |
| `--chart-2` | `oklch(0.556 0 0)` | 55.6% |
| `--chart-3` | `oklch(0.439 0 0)` | 43.9% |
| `--chart-4` | `oklch(0.371 0 0)` | 37.1% |
| `--chart-5` | `oklch(0.269 0 0)` | 26.9% |

Being identical across themes is a real limitation: `--chart-1` at 87% lightness is nearly invisible on a light background. **Before building the stats visualisation (Phase 4), give the dark ramp its own values.** Series in a monochrome ramp must also be distinguished by more than lightness — pattern, label, or direct annotation.

### 3.6 Deriving a colour instead of adding a token

Prefer the two mechanisms already in use over inventing a token:

```css
/* Opacity — Tailwind's slash syntax. */
bg-primary/80          bg-destructive/10          ring-ring/30

/* Perceptual mixing — used in Button's secondary variant. */
hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]
```

`color-mix(in oklch, …)` blends in a perceptually uniform space, so "5% toward the foreground" darkens by a consistent *visual* amount regardless of the starting colour — unlike an sRGB mix, which shifts unevenly. Use it for hover and pressed states derived from a base.

---

## 4. Radius

One base, six derived steps, all generated in `@theme inline` from `--radius: 0.625rem`.

| Utility | Formula | Computed | Use |
| :--- | :--- | ---: | :--- |
| `rounded-sm` | `--radius * 0.6` | 6 px | Badges, tags, inline chips |
| `rounded-md` | `--radius * 0.8` | 8 px | Inputs, small surfaces |
| `rounded-lg` | `--radius * 1` | 10 px | Cards, panels — the default |
| `rounded-xl` | `--radius * 1.4` | 14 px | Dialogs, modals |
| `rounded-2xl` | `--radius * 1.8` | 18 px | Large containers |
| `rounded-3xl` | `--radius * 2.2` | 22 px | Hero surfaces |
| `rounded-4xl` | `--radius * 2.6` | 26 px | **Buttons** — see below |

`Button` uses `rounded-4xl` (26 px) on a 36 px-tall element, which at that height reads as a pill. That is the `radix-luma` style's signature and it is intentional: buttons are the only pill-shaped elements, so "pill" reads as "clickable" throughout the interface. Do not use `rounded-4xl` on anything that is not a button.

Changing `--radius` rescales the entire system proportionally. That is the intended knob; do not hardcode `border-radius` values.

---

## 5. Typography

**Inter Variable**, self-hosted through `@fontsource-variable/inter`. Bundled, not fetched from a CDN — no third-party request, no FOUT, and no `font-src` CSP exception (see [security.md §9](./security.md#9-security-headers)).

```css
--font-sans: 'Inter Variable', sans-serif;
--font-heading: var(--font-sans);   /* one family; headings differ by weight and size only */
```

`html { @apply font-sans }` in the base layer applies it globally.

### Type scale

Tailwind defaults, constrained to the subset DevBoard uses. Do not reach for `text-2xl` and above without a reason.

| Utility | Size / line-height | Use |
| :--- | :--- | :--- |
| `text-xs` | 12 / 16 px | Timestamps, metadata, Inspector-bar readouts, badges |
| `text-sm` | 14 / 20 px | **The workhorse.** Body text, buttons, task titles, inputs |
| `text-base` | 16 / 24 px | Task modal body, comment text |
| `text-lg` | 18 / 28 px | Modal titles, section headings |
| `text-xl` | 20 / 28 px | Page titles |

| Weight | Use |
| :--- | :--- |
| `font-normal` (400) | Body |
| `font-medium` (500) | Buttons, labels, task titles, emphasis. **The default for anything interactive** |
| `font-semibold` (600) | Headings |

`font-bold` is unused. In a monochrome palette, weight is one of the few available emphasis signals, so spending it liberally destroys the hierarchy it is meant to create.

**Numerals.** For the Inspector bar's latency readouts, add `tabular-nums` — proportional digits make a number that updates every second appear to jitter.

---

## 6. Spacing and layout

Tailwind's 4 px scale. Constrain yourself to a small subset so rhythm is consistent:

| Step | px | Use |
| :--- | ---: | :--- |
| `1` | 4 | Icon-to-label inside a button |
| `2` | 8 | Tight stacks, badge padding |
| `3` | 12 | Card internal padding, form field gaps |
| `4` | 16 | Standard block separation |
| `6` | 24 | Section separation |
| `8` | 32 | Page-level padding |

Avoid odd steps (`5`, `7`, `9`) and arbitrary values (`p-[13px]`). If a layout needs an off-scale value, the surrounding structure is usually wrong.

| Breakpoint | Min width | Layout |
| :--- | ---: | :--- |
| — | 0 | Single column; sidebar in a drawer; Kanban columns stack vertically |
| `sm` | 640 px | Two Kanban columns side by side |
| `md` | 768 px | Sidebar becomes persistent |
| `lg` | 1024 px | All three Kanban columns; activity feed as a right rail |
| `xl` | 1280 px | Wider board columns, no layout change |

Screen-by-screen specifications live in [DESIGN.md](../DESIGN.md).

---

## 7. Component inventory

### Exists

| Component | File | Notes |
| :--- | :--- | :--- |
| `Button` | `src/components/ui/button.tsx` | Six variants, eight sizes. The reference implementation for every component that follows |

### To add

| Component | Phase | Primary use |
| :--- | :---: | :--- |
| `Input`, `Label`, `Textarea` | 2 | Auth forms, task editing |
| `Dialog` | 2 | Task modal, auth modal |
| `Card` | 2 | Task cards, project cards |
| `Avatar` | 2 | Assignees, comment authors, presence |
| `Badge` | 2 | Status, priority, attachment counts, service pills |
| `DropdownMenu` | 2 | Task actions, project switcher |
| `Tooltip` | 2 | Inspector-bar explanations, icon buttons |
| `Toast` / `Sonner` | 2 | Mutation errors, conflict notices |
| `Skeleton` | 2 | Loading states |
| `Progress` | 3 | Upload progress |
| `Separator`, `ScrollArea` | 3 | Modal sections, activity feed |
| `Sheet` | 4 | Mobile sidebar drawer |
| `Popover` | 4 | Cache inspector detail |
| `Tabs` | 6 | Board / Activity switching |

```bash
npx shadcn@latest add dialog input label badge avatar
```

The CLI reads `components.json`, so it emits `radix-luma`-styled components using the existing tokens, into `src/components/ui/`, with `@/` imports. **Review every generated file before committing** — treat it as a starting point that must match §8, not as a vendored dependency.

---

## 8. The house component pattern

`button.tsx` establishes the conventions. Every new component follows them.

```tsx
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-4xl border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 …",
  { variants: { variant: { … }, size: { … } }, defaultVariants: { … } },
);

function Button({ className, variant = "default", size = "default", asChild = false, ...props }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
```

| Convention | Rule |
| :--- | :--- |
| **`cva` for variants** | Base classes first, then a `variants` object, then `defaultVariants`. Never build class strings with template literals or conditionals |
| **`data-slot`** | Every component root carries `data-slot="<name>"`. It gives parents a stable selector (`[&_[data-slot=button]]:…`) that survives class changes |
| **`data-variant` / `data-size`** | Mirror the props onto the DOM. Invaluable for debugging and for tests that assert intent rather than class strings |
| **`asChild`** | Accept it wherever the element might need to become a link or a Radix trigger. Implemented with `Slot.Root` from `radix-ui` |
| **`className` last** | `cn(variants({ … , className }))` — caller overrides win |
| **Props via `React.ComponentProps<"button">`** | Not a hand-written interface. Spread `...props`, forward everything |
| **Named exports** | Export the component *and* its `cva` function (`export { Button, buttonVariants }`) so variants can be reused on other elements |
| **No `forwardRef`** | React 19 passes `ref` as an ordinary prop |
| **Focus** | `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30`, and `outline-none` **only** in combination with a visible ring |
| **Invalid** | `aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20` — styling keys off the ARIA attribute, so accessibility and appearance cannot drift apart |
| **Disabled** | `disabled:pointer-events-none disabled:opacity-50` |
| **Icons** | `[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4` — sizes icons automatically unless explicitly overridden |
| **Icon position** | `data-icon="inline-start"` / `"inline-end"` on the icon; the parent adjusts padding via `has-data-[icon=inline-end]:pr-2.5` |
| **Press feedback** | `active:not-aria-[haspopup]:translate-y-px` — a 1 px nudge, suppressed for menu triggers where the popup is the feedback |

### `Button` reference

| Variant | Appearance |
| :--- | :--- |
| `default` | `bg-primary text-primary-foreground`, hover `bg-primary/80` |
| `outline` | Bordered, transparent; dark mode uses `bg-transparent` with `hover:bg-input/30` |
| `secondary` | `bg-secondary`, hover via `color-mix` toward foreground |
| `ghost` | No fill until hover |
| `destructive` | **Tinted, not solid** — `bg-destructive/10 text-destructive`. Destructive actions read as red text on a red wash, not a red button |
| `link` | Underline on hover |

| Size | Height | Notes |
| :--- | :--- | :--- |
| `default` | `h-9` (36 px) | |
| `xs` | `h-6` (24 px) | `text-xs`, 12 px icons |
| `sm` | `h-8` (32 px) | |
| `lg` | `h-10` (40 px) | |
| `icon` | `size-9` | Square |
| `icon-xs` | `size-6` | |
| `icon-sm` | `size-8` | |
| `icon-lg` | `size-10` | |

Sizes below `h-9` are under the 44 px touch-target guideline. Restrict `xs` and `icon-xs` to dense desktop chrome — the Inspector bar — and never use them for a primary mobile action.

---

## 9. The `cn` utility

There is **one** implementation, reached by two import paths. Both are correct.

```ts
// src/components/ui/button.tsx
import { cn } from "cn"           // the cn package directly

// src/lib/utils.ts  — the whole file
export { cn } from "cn"           // re-export, so the components.json alias resolves

// components.json
"aliases": { "utils": "@/lib/utils" }
```

**Do not replace this with `clsx` + `tailwind-merge`.** The [`cn` package](https://github.com/shadcn-ui/cn) is shadcn's own successor to that pair — "fast, small, compiled class-name merging for Tailwind CSS, a drop-in replacement for clsx + tailwind-merge". It already does conflict resolution, it is maintained by the same project that generates these components, and it is a single compiled dependency instead of two. Swapping it out would be a downgrade.

**Why the re-export in `src/lib/utils.ts` matters.** `npx shadcn add` emits `import { cn } from "@/lib/utils"` because that is what `components.json` declares. The one-line re-export makes that alias resolve to the same function `button.tsx` uses, so generated components work with no edit. Keep the file.

**What `cn` buys you over plain concatenation.** `cn("px-3", "px-6")` returns `"px-6"`, not `"px-3 px-6"`. Naive concatenation leaves both classes in the string and the winner depends on CSS source order — meaning a caller's `className` override may silently not apply. Conflict resolution is what makes the "`className` last" convention in §8 actually work.

**Optional consistency tidy.** `button.tsx` could import from `@/lib/utils` instead of `"cn"` so every component in `src/components/ui/` uses the same path as generated ones. Purely cosmetic — both resolve to the same function.

---

## 10. DevBoard-specific semantics

The monochrome palette carries no inherent meaning, so status must be encoded deliberately — and, critically, **never by colour alone**.

### Task status

| Status | Treatment |
| :--- | :--- |
| `todo` | `bg-muted text-muted-foreground`, circle icon |
| `in_progress` | `bg-secondary text-secondary-foreground` + `font-medium`, half-filled circle |
| `done` | `bg-muted text-muted-foreground` + `line-through` on the title, check icon |

### Priority

Weight and a glyph, not colour — except `urgent`, the one case worth spending `destructive` on.

| Priority | Treatment |
| :--- | :--- |
| `low` | `text-muted-foreground`, no icon |
| `medium` | Default text, no icon |
| `high` | `font-medium` + chevron-up icon |
| `urgent` | `text-destructive` + `font-medium` + alert icon |

### Cloudflare service pills (Inspector bar)

| State | Treatment |
| :--- | :--- |
| Idle | `bg-muted text-muted-foreground` |
| Active this request | `bg-primary text-primary-foreground`, brief pulse via `tw-animate-css` |
| Error | `bg-destructive/10 text-destructive` |

### Cache status

| Value | Treatment |
| :--- | :--- |
| `HIT` | `bg-primary text-primary-foreground` — filled, "we did the fast thing" |
| `MISS` | `bg-muted text-muted-foreground` + outline |
| `BYPASS` | `bg-muted text-muted-foreground` + dashed border |

Every one of these carries a text label in addition to its styling. A user who cannot distinguish the fills still reads "HIT".

---

## 11. Dark mode

```tsx
document.documentElement.classList.toggle("dark", isDark);
```

Persist the choice in `localStorage`, initialise from `matchMedia("(prefers-color-scheme: dark)")` when unset, and apply it in an inline script in `index.html` **before** React hydrates — otherwise the page flashes light before switching.

Rules:

- **Never hardcode a colour.** No `text-white`, no `bg-black`, no `bg-neutral-100`. Only semantic tokens. This is the single rule that makes dark mode work for free.
- `dark:` overrides are for *structural* differences only — the ones in `button.tsx` (`dark:bg-transparent`, `dark:hover:bg-input/30`) exist because outline buttons need a different fill strategy on a dark ground, not because of a colour value.
- Test every new component in both themes before committing. Half of dark-mode bugs are visible in two seconds and invisible forever if nobody looks.

---

## 12. Accessibility checklist

Applies to every component and every screen.

**Colour and contrast**
- [ ] Body text ≥ 4.5:1 against its background; large text and UI boundaries ≥ 3:1
- [ ] Verified in **both** themes
- [ ] `--muted-foreground` on `--muted` checked specifically — it is the tightest pair in the system
- [ ] No information conveyed by colour alone (§10)

**Keyboard**
- [ ] Every interactive element reachable by <kbd>Tab</kbd>, in reading order
- [ ] Focus ring always visible — `focus-visible:ring-3 ring-ring/30`, never suppressed
- [ ] `Dialog` traps focus while open and restores it to the trigger on close
- [ ] <kbd>Esc</kbd> closes dialogs, popovers, and menus
- [ ] **Drag and drop has a keyboard equivalent** — move a task between columns with arrow keys or an explicit menu action. Non-negotiable; a drag-only board is unusable without a mouse

**Semantics**
- [ ] Real `<button>` and `<a>` elements; never a clickable `<div>`
- [ ] Icon-only buttons have an `aria-label`
- [ ] Form inputs have an associated `<label>`; errors use `aria-invalid` and `aria-describedby`
- [ ] Kanban columns are landmarks or labelled regions with accessible names
- [ ] Heading levels descend without gaps

**Dynamic content**
- [ ] Realtime updates announced through an `aria-live="polite"` region
- [ ] Announcements are debounced — a busy board must not flood a screen reader
- [ ] Loading states use `aria-busy`, not just a visual skeleton
- [ ] Toasts are announced; destructive confirmations use `role="alertdialog"`

**Motion**
- [ ] Every animation respects `prefers-reduced-motion` (see [DESIGN.md](../DESIGN.md))
- [ ] Nothing flashes more than three times per second

**Targets**
- [ ] Interactive targets ≥ 44 × 44 px on touch layouts
- [ ] `xs` and `icon-xs` sizes confined to dense desktop chrome

---

## 13. Adding a component — the checklist

- [ ] Does shadcn already provide it? Generate it rather than writing it
- [ ] Follows every convention in §8 (`cva`, `data-slot`, `asChild`, `className` last)
- [ ] Uses only semantic tokens — no hardcoded colours, no arbitrary radii
- [ ] Correct in both themes
- [ ] Passes the §12 checklist
- [ ] Icons from `lucide-react`, unsized so the base rule handles them
- [ ] Exported from its own file in `src/components/ui/`, named export
- [ ] Added to the inventory in §7
