import { TextProcessor, Script } from './pali-script.js';
import { installPaliInput } from './pali_typing.js';

// ── State ─────────────────────────────────────────────────────────────────────
let bookData      = null;
let currentScript = 'ro';
let fontSize      = 16;
let sidebarOpen   = true;
let paliElements  = [];   // [{ el, roman }]
let flatToc       = [];

// ── DOM refs ──────────────────────────────────────────────────────────────────
const sidebar     = document.getElementById('sidebar');
const tocRoot     = document.getElementById('toc-root');
const tocStatus   = document.getElementById('toc-status');
const welcome     = document.getElementById('welcome');
const errBox      = document.getElementById('error-msg');
const chapterWrap = document.getElementById('chapter-content');
const chapBread   = document.getElementById('chapter-breadcrumb');
const chapTitle   = document.getElementById('chapter-title');
const chapBody    = document.getElementById('chapter-body');
const chapNav     = document.getElementById('chapter-nav');
const topTitle    = document.getElementById('topbar-title');
const contentWrap = document.getElementById('content-wrap');
const overlay     = document.getElementById('overlay');
const scriptSel   = document.getElementById('script-select');

// ── Font size ─────────────────────────────────────────────────────────────────
document.getElementById('font-sm').addEventListener('click', () => {
  fontSize = Math.max(13, fontSize - 1);
  document.documentElement.style.setProperty('--font-base', fontSize + 'px');
});
document.getElementById('font-lg').addEventListener('click', () => {
  fontSize = Math.min(24, fontSize + 1);
  document.documentElement.style.setProperty('--font-base', fontSize + 'px');
});

// ── Sidebar ───────────────────────────────────────────────────────────────────
function setSidebar(open) {
  sidebarOpen = open;
  sidebar.classList.toggle('hidden', !open);
  sidebar.classList.toggle('open', open);
  contentWrap.classList.toggle('sidebar-hidden', !open);
  overlay.classList.toggle('active', open && window.innerWidth <= 700);
}
document.getElementById('menu-btn').addEventListener('click', () => setSidebar(!sidebarOpen));
overlay.addEventListener('click', () => setSidebar(false));

// ── Pāli script conversion ────────────────────────────────────────────────────
// Data is stored as Roman. Conversion: RO → SI (pivot) → target.
const SCRIPT_MAP = {
  ro: Script.RO, si: Script.SI, hi: Script.HI,
  th: Script.THAI, lo: Script.LAOS, my: Script.MY,
  km: Script.KM,  be: Script.BENG,
};

function romanTo(roman, target) {
  if (target === Script.RO) return roman;
  const sinhala = TextProcessor.convertFrom(roman, Script.RO);
  return TextProcessor.convert(sinhala, target);
}

function applyScript() {
  const target = SCRIPT_MAP[currentScript];
  // Set body attribute so CSS applies the right font-family
  document.body.setAttribute('script', currentScript);
  paliElements.forEach(({ el, roman }) => {
    el.textContent = romanTo(roman, target);
  });
}

scriptSel.value = currentScript;
scriptSel.addEventListener('change', e => {
  currentScript = e.target.value;
  applyScript();
});

// After rendering TOC, set up search functionality
function buildSearchIndex(nodes, list = []) {
  for (const n of nodes) {
    list.push({ id: n.id, label: n.label, file: n.file });
    if (n.children) buildSearchIndex(n.children, list);
  }
  return list;
}

function showSearchSuggestions(query) {
  const q = query.trim().toLowerCase();
  if (!q) { suggestionsDiv.classList.add('hidden'); return; }
  const matches = flatToc.filter(item => item.label.toLowerCase().includes(q)).slice(0, 10);
  suggestionsDiv.innerHTML = '';
  matches.forEach(item => {
    const div = document.createElement('div');
    div.className = 'suggestion-item';
    div.textContent = item.label;
    div.addEventListener('click', () => {
      showChapter(item.file, findNodeById(item.id), findParent(item.file));
      setActiveTOC(item.id);
      suggestionsDiv.classList.add('hidden');
      searchInput.value = '';
    });
    suggestionsDiv.appendChild(div);
  });
  suggestionsDiv.classList.toggle('hidden', matches.length === 0);
}

const searchInput = document.getElementById('search-input');
const suggestionsDiv = document.getElementById('search-suggestions');
installPaliInput(searchInput);
// Hide suggestions when clicking outside
document.addEventListener('click', (e) => {
  if (!searchInput.contains(e.target) && !suggestionsDiv.contains(e.target)) {
    suggestionsDiv.classList.add('hidden');
  }
});

// Add event listener for search input
searchInput.addEventListener('input', (e) => {
  showSearchSuggestions(e.target.value);
});

// ── TOC rendering ─────────────────────────────────────────────────────────────
function renderTOC(nodes) {
  tocRoot.innerHTML = '';
  flatToc = buildSearchIndex(nodes);
  nodes.forEach(n => tocRoot.appendChild(makeTocNode(n)));
}

function makeTocNode(node) {
  const wrap = document.createElement('div');
  wrap.className = 'toc-item';
  wrap.dataset.id = node.id;

  const hasChildren = node.children && node.children.length > 0;

  // Arrow button for expanding/collapsing children
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'toc-toggle';
  toggleBtn.dataset.id = node.id;
  toggleBtn.dataset.file = node.file || '';
  toggleBtn.innerHTML = `
    <svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
         style="opacity:${hasChildren ? .7 : .25}">
      <polyline points="9 6 15 12 9 18"/>
    </svg>
    <span class="toc-num">${node.id}</span>
    <span class="toc-label">${node.label}</span>`;

  // If the node has its own content (file), clicking the label should navigate.
  const labelClick = (e) => {
    // Prevent arrow toggle when clicking on the label part.
    if (e.target.closest('.arrow')) {
       e.stopPropagation();
       return;
    }
    if (node.file) {
      showChapter(node.file, node, findParent(node.file));
      setActiveTOC(node.id);
    }
    // Stop propagation so the expand toggle listener does not also fire
    e.stopPropagation();
  };
  toggleBtn.addEventListener('click', labelClick);

  if (hasChildren) {
    const childWrap = document.createElement('div');
    childWrap.className = 'toc-children';
      toggleBtn.addEventListener('click', (e) => {
        // Only toggle expansion when clicking the arrow icon
        if (!e.target.closest('.arrow')) {
          return;
        }
        const open = toggleBtn.classList.toggle('open');
        childWrap.classList.toggle('open', open);
      });
    node.children.forEach(c => {
      const cb = document.createElement('button');
      cb.className = 'toc-child-item';
      cb.dataset.id = c.id;
      cb.dataset.file = c.file;
      cb.innerHTML = `<span class="toc-num">${c.id}</span><span class="toc-label">${c.label}</span>`;
      cb.addEventListener('click', (e) => {
        showChapter(c.file, c, node);
        e.stopPropagation();
      });
      childWrap.appendChild(cb);
    });
    wrap.appendChild(toggleBtn);
    wrap.appendChild(childWrap);
  } else {
    // Leaf node – direct navigation on click
    wrap.appendChild(toggleBtn);
  }

  return wrap;
}

function setActiveTOC(id) {
  document.querySelectorAll('.toc-toggle, .toc-child-item').forEach(el => el.classList.remove('active'));
  const el = document.querySelector(`[data-id="${id}"]`);
  if (!el) return;
  el.classList.add('active');
  const group = el.closest('.toc-children');
  if (group) {
    group.classList.add('open');
    group.previousElementSibling?.classList.add('open');
  }
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ── Chapter display ───────────────────────────────────────────────────────────
function showChapter(file, node, parentNode) {
  if (!file) return;
  const chapter = bookData.chapters[file];
  if (!chapter) {
    showError(`Chapter not found: "${file}"\nRun npm run build:content first.`);
    return;
  }

  if (window.innerWidth <= 700) setSidebar(false);

  welcome.style.display = 'none';
  errBox.className = '';
  chapterWrap.style.display = 'block';

  chapBread.innerHTML = `
    <span>Monastic Procedures</span>
    ${parentNode ? `<span class="sep">›</span><span>${parentNode.label}</span>` : ''}
    <span class="sep">›</span><span>${node.label.substring(0, 70)}</span>`;

  chapTitle.textContent = chapter.title || node.label;
  chapBody.innerHTML = chapter.body;

  // Collect .pali-text; data is Roman
  paliElements = [];
  chapBody.querySelectorAll('.pali-text').forEach(el => {
    paliElements.push({ el, roman: el.textContent });
  });
  applyScript();

  // Wire up any internal links in the body (subtopics list etc.)
  chapBody.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('http') || href.startsWith('#')) return;
    a.addEventListener('click', e => {
      e.preventDefault();
      const n = findNodeByFile(href) || { id: href, label: href, file: href };
      showChapter(href, n, findParent(href));
      setActiveTOC(n.id);
    });
  });

  // Prev / Next
  chapNav.innerHTML = '';
  if (chapter.prev) {
    const pNode = findNodeByFile(chapter.prev) || { id: chapter.prev, file: chapter.prev };
    const btn = document.createElement('button');
    btn.className = 'nav-btn prev';
    btn.textContent = chapter.prevLabel || 'Previous';
    btn.addEventListener('click', () => {
      showChapter(chapter.prev, pNode, findParent(chapter.prev));
      setActiveTOC(pNode.id);
    });
    chapNav.appendChild(btn);
  }
  if (chapter.next) {
    const nNode = findNodeByFile(chapter.next) || { id: chapter.next, file: chapter.next };
    const btn = document.createElement('button');
    btn.className = 'nav-btn next';
    btn.textContent = chapter.nextLabel || 'Next';
    btn.addEventListener('click', () => {
      showChapter(chapter.next, nNode, findParent(chapter.next));
      setActiveTOC(nNode.id);
    });
    chapNav.appendChild(btn);
  }

  topTitle.textContent = node.label.substring(0, 60);
  setActiveTOC(node.id);
  history.replaceState(null, '', `#${node.id}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showError(msg) {
  welcome.style.display = 'none';
  chapterWrap.style.display = 'none';
  errBox.textContent = msg;
  errBox.className = 'active';
}

// ── Tree helpers ──────────────────────────────────────────────────────────────
function walkNodes(nodes, fn) {
  for (const n of nodes) { fn(n); if (n.children) walkNodes(n.children, fn); }
}
function findNodeByFile(file) {
  let found = null;
  walkNodes(bookData.toc, n => { if (n.file === file) found = n; });
  return found;
}
function findParent(file) {
  let found = null;
  walkNodes(bookData.toc, n => { if (n.children?.some(c => c.file === file)) found = n; });
  return found;
}
function findNodeById(id) {
  let found = null;
  walkNodes(bookData.toc, n => { if (n.id === id) found = n; });
  return found;
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  // Apply initial script attribute
  document.body.setAttribute('script', currentScript);

  try {
    const res = await fetch('./book_data.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    bookData = await res.json();
  } catch (e) {
    tocStatus.textContent = 'Failed to load.';
    showError(`Could not load book_data.json — ${e.message}\nRun "npm run build:content" first.`);
    return;
  }

  renderTOC(bookData.toc);
  tocStatus.textContent = `${Object.keys(bookData.chapters).length} chapters`;

  const hash = location.hash.slice(1);
  if (hash) {
    const node = findNodeById(hash);
    if (node) showChapter(node.file, node, findParent(node.file));
  }
}

init();
