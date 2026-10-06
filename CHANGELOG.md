# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Per-key usage view** — the Account balance card has an API key picker; Today, This month and the V4 Flash / V4 Pro rows (tokens, cache hit, spend, and the 7-day chart) then show that key's stats, while the balance stays account-level
- **Per-API-key usage breakdown** — a "By API key" card on the dashboard splits the selected month's requests, tokens, cache hit rate and spend across every API key of the account. Data comes from the official DeepSeek usage export (the live usage API has no per-key breakdown): it is fetched automatically with the usage token, cached per month, or imported manually as an exported ZIP/CSV
- **English localization** — the UI, tray menu, notifications and error messages are now available in English as well as Simplified Chinese
- **Language selector** — pick the interface language from a dropdown at the top of Settings; Simplified Chinese stays the default and the choice is saved in the config

### Fixed

- Per-key, per-model and per-day costs keep each currency separate instead of summing them into one figure — accounts billed in several currencies (e.g. `$0.65 USD + ¥6.04 CNY`) now match the platform again; per-key money is allocated from the official `cost.csv` so the parts add up to the total
- A day or model charged in a single currency no longer loses that currency: previously a USD-only day could be relabelled with the account's primary currency (e.g. `¥0.19` for a `$0.19` amount), so Today could show the wrong symbol while This month looked fine
- The frameless transparent window no longer shows a dark native outline that ignored the app's rounded contour (the OS shadow and native corner rounding are disabled, so the CSS panel defines the shape)
- Money amounts are now labelled with the currency the DeepSeek API reports (e.g. `$` for USD accounts) instead of always showing `¥`
- Launching the app again (Finder, Spotlight, Launchpad, Start menu) now brings back the window hidden to the tray instead of doing nothing or starting a second instance
- The macOS menu bar icon is now a monochrome template image, so it matches the other menu bar icons in light and dark mode instead of showing the blue app icon

### Security

- Auto-updates are now published from and fetched from `yaro-o-O/deepseek-monitor`
- The usage-token sign-in window only inspects requests to `https://platform.deepseek.com`, so bearer tokens of other sites are never captured or sent for verification; the request hook is removed when the window closes
- The per-key usage export can contain the API key value in clear text; the app only ever keeps a masked form (`sk-abc…0def`) in memory and never logs or displays the full key
- Server error messages and account names are rendered as text instead of HTML
- Updated `js-yaml` to 4.3.2 (GHSA-2883-xcg3-v3hh)
- Updated `electron-builder` from 24.13.3 to 26.15.3, clearing the remaining build-tool advisories (including `tar` path traversal and `builder-util-runtime` credential leak on redirects)
- `package-lock.json` now resolves packages from the official npm registry (added `.npmrc`); all integrity hashes are unchanged
- Removed unused `requestExternalJson` helper

## [1.2.0] - 2026-08-11

### Added

- **Always-on-top widget mode** — pin the window above other apps from Settings or the tray menu; the app is tray-only and never shows a taskbar/Dock icon
- **Hover auto-hide / fade** — when always-on-top is enabled, hovering over the window auto-hides or fades it to a preset opacity (click-through, so it never blocks the desktop) and it restores once the mouse moves away
- **Tray menu controls** — toggle always-on-top, choose the mouse-leave behavior, and pick the fade opacity directly from the tray context menu

### Changed

- Minimizing the window now hides it to the tray so no taskbar icon remains
- Hover detection on Linux queries the X server directly for the real cursor position (Electron's cached cursor API is unreliable there); Windows and macOS use the built-in API

## [1.1.0] - 2026-08-05

### Added

- **Balance alerts** — system notification when the balance drops below a configurable threshold (per-account, once until it recovers)
- **Multi-account support** — manage multiple DeepSeek accounts with one-click switching; legacy single-account config auto-migrates
- **Encrypted credential storage** — API keys and usage tokens are now encrypted with Electron `safeStorage` (OS keychain); plain-text legacy values are re-encrypted on first launch
- **In-app auto-update** — check for updates from Settings; downloads and installs new releases automatically

### Changed

- Credential operations apply to the currently active account

## [1.0.0] - 2026-06-13

### Added

- Real-time DeepSeek account balance monitoring
- Dual-model usage statistics (V4 Flash / V4 Pro): tokens, cache hit rate, spend
- 7-day token usage trend charts with cache hit / miss / output breakdown
- Per-day usage drill-down details page
- Auto refresh (1 min / 5 min / 30 min / 1 hour)
- Launch at startup for Windows and macOS
- System tray support with window-to-tray minimize
- Built-in browser login window with automatic usage token capture
- Frameless transparent glassy dark UI
