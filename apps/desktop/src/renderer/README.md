# Renderer conventions

The renderer treats Electron preload IPC as a server-state boundary. It is a sandboxed React client, not a second application runtime.

## Where code belongs

- `app/`: providers, cache configuration, runtime-event orchestration, and shell composition.
- `api/`: the only code allowed to call `window.sleeperCaffeine`; typed query and mutation hooks live here.
- `components/ui/`: internal, fantasy-agnostic controls and surfaces.
- `features/`: product-domain components, locally scoped state, and CSS Modules.
- `styles/`: semantic design tokens, reset, and genuinely global Electron chrome.

Keep fantasy calculations in the main process/domain packages. A feature component may select and present canonical data, but it should not duplicate roster, draft, or ranking logic.

## Data and mutations

Read canonical app state through TanStack Query. Use stable keys from `api/query-keys.ts`; do not call preload APIs from feature code. Runtime events either update a narrow cache field or invalidate the bootstrap query.

Every operation has independent pending/error state. Refreshing Sleeper and generating AI are deliberately separate operations. Never add an automatic AI mutation to a query or refresh side effect.

Assistant streaming remains in assistant-ui's external runtime because partial turn state is not canonical server data.

## Components and styling

Use an existing primitive before adding a page-specific button, status, avatar, form field, dialog, or drawer. Primitives own interaction semantics; features own fantasy meaning and layout.

Feature styles use CSS Modules and semantic properties from `styles/tokens.css`. Metadata must be at least `10px`, ordinary body copy at least `12px`, and control labels normally at least `14px`. Prefer the shared spacing, radius, shadow, motion, and layer tokens over new raw values.

New primitives need a Storybook story covering variants and a browser test for behavior. New feature slices need browser coverage for their main path plus meaningful loading and error states.

## Desktop platforms

Use the typed `Bootstrap.platform` value for behavior that truly differs by operating system. Keep macOS traffic-light spacing in the shell; feature layouts must not depend on it. Native controls, scroll areas, focus styles, and minimum-window behavior should remain usable on macOS, Windows, and Linux.

## Checks

```bash
pnpm --filter @sleeper-caffeine/desktop test:browser
pnpm --filter @sleeper-caffeine/desktop storybook
pnpm --filter @sleeper-caffeine/desktop storybook:build
```
