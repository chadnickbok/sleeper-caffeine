# Desktop platform validation

Sleeper Caffeine supports macOS, Windows, and Linux as a desktop-only application. The minimum application window is **1050 × 720 CSS pixels**; the default window is 1440 × 930.

## Automated coverage

Run the complete local verification set:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @sleeper-caffeine/desktop test:browser
pnpm --filter @sleeper-caffeine/desktop storybook:build
pnpm build
```

GitHub Actions builds unpacked applications on native macOS, Windows, and Linux runners. This catches platform-specific native dependencies, paths, icons, and Electron packaging failures without publishing unsigned installers.

## Native smoke checklist

On each operating system, open the unpacked application and verify:

1. The window opens at the default size and cannot shrink below 1050 × 720.
2. macOS uses inset traffic lights; Windows and Linux retain their native title bars and window controls.
3. Dragging works only in designated macOS shell regions. Buttons, selects, inputs, links, and disclosure controls remain interactive.
4. Front Office, Roster, reports, Settings, and Draft Room scroll vertically without page-level horizontal overflow.
5. Draft Room’s board retains its own horizontal scroll area at compact widths.
6. Native selects open above surrounding content and remain keyboard operable.
7. Dialogs and the analyst drawer close through their visible close control and Escape.
8. Bundled Manrope and DM Mono fonts render without a network connection.
9. Sleeper refresh updates local state without starting an AI turn.
10. The app discovers an installed `codex`, `codex.exe`, or Windows command shim, then creates its isolated `codex-home` below Electron’s `userData` directory.

## Mutable paths

Packaged application resources are read-only. All mutable state is resolved below Electron’s platform-specific `userData` directory:

```text
userData/
  sleeper-caffeine.sqlite
  cache/sleeper/
  codex-home/
  analyst-workspace/
```

No runtime code writes inside `app.asar`, the installation directory, or the current working directory.

## Packaging commands

For local native packaging:

```bash
pnpm --filter @sleeper-caffeine/desktop exec electron-builder --mac --dir
pnpm --filter @sleeper-caffeine/desktop exec electron-builder --linux --dir
pnpm --filter @sleeper-caffeine/desktop exec electron-builder --win --dir
```

Run the command matching the host platform. Cross-building can miss native-runtime problems and is not a substitute for the native CI matrix.
