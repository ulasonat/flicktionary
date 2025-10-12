# Repository Guidelines

## Project Structure & Module Organization
Flicktionary pairs an Electron main process with a React renderer. All sources sit in `src/`: `src/main/` holds `main.ts` and the `preload.js` bridge, while `src/renderer/` contains UI components, shared `types/`, and `styles/`. The shared HTML entry is `src/index.html`. Builds emit into `dist/`; do not edit generated files. Sample media lives in `audio/` and `png/`. The `Makefile` replicates the npm workflows for those who prefer `make`.

## Build, Test, and Development Commands
Run `npm run dev` for the webpack dev server with hot reload. Launch Electron against the compiled output with `npm start` (alias `electron .`). `npm run build:renderer` bundles React, `npm run build:main` compiles the main process, and `npm run build` executes both plus asset copy steps. `npm run dist` builds a distributable via `electron-builder`. `make run` chains install → build → start when you need a clean pass.

## Coding Style & Naming Conventions
TypeScript operates in `strict` mode (`tsconfig.json`), so heed compiler feedback. Use 2-space indentation, single quotes, and descriptive names. Components/files stay in PascalCase (`VocabularySession.tsx`); hooks and helpers adopt camelCase. Share reusable contracts through `src/renderer/types` and keep preload APIs minimal and typed to avoid widening the Electron surface.

## Testing Guidelines
No automated runner ships yet, so perform manual smoke tests with `npm run dev` plus `npm start` before opening a PR. When adding coverage, colocate specs beside the code (e.g. `Component.test.tsx`), wire the command as `npm test`, and document new fixtures. Prioritize tests around preload messaging, subtitle parsing, and vocabulary export edge cases.

## Commit & Pull Request Guidelines
Recent history uses short, imperative commits (`Improve subtitle offset handling`). Keep changes focused and commit assets or schema updates together. PR descriptions should explain user impact, call out required env vars like `GEMINI_API_KEY`, and attach screenshots or clips for UI-facing work. Reference related issues and confirm `npm run build` passes locally.

## Configuration & Secrets
Keep secrets in a local `.env`; `GEMINI_API_KEY` is required for Gemini lookups. Never commit `.env` or licensed media. Run `npm install` before the first launch so bundled ffmpeg binaries resolve correctly.
