# Monastic Procedures — Book Reader
[DEMO](https://kamma.iit.qzz.io/)

Static book reader built with Vite. Reads the source HTML chapter files once at
build time and produces a self-contained `dist/` folder ready for GitHub Pages.

## Setup

```bash
npm install
```

## Usage

### 1. Build content  →  `public/book_data.json`

```bash
npm run build:content
```

Reads all `*_en.html` files + `index_en.html` from the source directory.  
Default source: `../../vinaya_karma_en`  — override with `SOURCE_DIR`:

```bash
SOURCE_DIR=/path/to/vinaya_karma_en npm run build:content
```

### 2. Dev server (hot-reload)

```bash
npm run dev
```

### 3. Production build  →  `dist/`

```bash
npm run build
```

If your GitHub Pages repo is served from a sub-path (e.g. `https://user.github.io/my-repo/`),
set `BASE_URL` so asset paths are correct:

```bash
BASE_URL=/my-repo/ npm run build
```

Upload the entire `dist/` folder to GitHub Pages.

---

## Project layout

```
book-reader/
├── scripts/
│   └── build-content.js   ← parses source HTML → public/book_data.json
├── src/
│   ├── main.js            ← reader app
│   ├── style.css
│   └── pali-script.js     ← Pāli script conversion library
├── public/
│   └── book_data.json     ← generated (not committed)
├── index.html
├── vite.config.js
└── package.json
```

## Features

- Collapsible TOC sidebar parsed from `index_en.html`
- Live Pāli script switching (Sinhala, Roman, Devanagari, Thai, Myanmar, Khmer, Laos, Bengali)
- Font size A− / A+ controls
- Prev / Next chapter navigation
- URL hash links — e.g. `index.html#2-5` opens that chapter directly
