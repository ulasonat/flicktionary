# Flicktionary

Learn English vocabulary **in context** by watching movie clips.

> **Tech:** Electron + React (TypeScript), ffmpeg‑static, Google Gemini 2.5‑pro

---

## Features
- Upload a **video**, its **subtitles** (or auto‑extract them), and let Gemini generate a tailored vocabulary list  
- Beautiful dark UI with progress tracking and per‑word video looping  
- Saves an output JSON of the words you didn’t know for future study

---

## Prerequisites

| Tool | Version |
|------|---------|
| **Node.js** | ≥ 18 |
| **npm** | comes with Node |
| **macOS** | app runs natively; Windows/Linux not packaged yet |
| **Google AI key** | set `GEMINI_API_KEY` |

---

## Quick start (dev mode)

```bash
# 1 Clone & install deps
git clone https://github.com/ulasonat/flicktionary.git
cd flicktionary
npm install

# 2 Provide your Gemini key once
echo "GEMINI_API_KEY=your-key" > .env

# 3 Hot‑reload React while hacking
npm run dev          # starts webpack-dev-server
# In a second terminal
npx electron .
```

---

## Build a production binary (macOS)

```bash
npm run build        # compile TypeScript & bundle renderer
npm start            # launches the compiled app
# OR generate a signed .app/.dmg
npm run dist         # uses electron-builder
```

The macOS bundle will appear under **dist/**.

---

## License
MIT — do whatever you like, just keep the notice.

