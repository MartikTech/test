const SUPABASE_URL = 'https://rirgluzzfkswzepigcgx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpcmdsdXp6Zmtzd3plcGlnY2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMTc0NDUsImV4cCI6MjA5NTc5MzQ0NX0.0xzyj34kibuzh_BDubg9s3Z-d3Qpw1zmMPrvEwbB6h0';
const REDIRECT = 'https://martiktech.github.io/test/index.html';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const LANG_COLORS = {
  JavaScript:'#f1e05a',TypeScript:'#3178c6',Python:'#3572A5',Go:'#00ADD8',
  Rust:'#dea584',Ruby:'#701516',Java:'#b07219','C++':'#f34b7d',
  C:'#555',Shell:'#89e051',Kotlin:'#A97BFF',Swift:'#F05138',
};

let session = null;
let githubToken = null;
let userStars = new Set();
let currentTopic = '';
let currentQuery = '';
let currentPage = 1;
let loading = false;
let hasMore = true;
let debounce;

async function init() {
  const { data } = await sb.auth.getSession();
  session = data.session;
  githubToken = session?.provider_token || null;
  if (session) await loadUserStars();
  renderAuth();
  load(true);
  setupInfiniteScroll();
  setupModal();

  sb.auth.onAuthStateChange((_e, s) => {
    session = s;
    githubToken = s?.provider_token || null;
    renderAuth();
    if (s) loadUserStars().then(() => load(true));
    else { userStars.clear(); load(true); }
  });

  document.getElementById('filters').addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTopic = btn.dataset.topic;
    currentQuery = '';
    document.getElementById('searchInput').value = '';
    load(true);
  });

  document.getElementById('searchInput').addEventListener('input', e => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      currentQuery = e.target.value.trim();
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      if (!currentQuery) document.querySelector('.filter-btn[data-topic=""]').classList.add('active');
      load(true);
    }, 400);
  });

  document.addEventListener('click', e => {
    const menu = document.getElementById('userDropdown');
    if (menu && !menu.closest('.user-menu').contains(e.target)) menu.classList.remove('open');
  });
}

async function loadUserStars() {
  if (!session) return;
  const { data } = await sb.from('stars').select('github_repo_id').eq('user_id', session.user.id);
  userStars = new Set((data || []).map(r => r.github_repo_id));
}

function renderAuth() {
  const area = document.getElementById('authArea');
  if (!session) {
    area.innerHTML = `
      <button class="login-btn" onclick="signIn()">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
        Sign in with GitHub
      </button>`;
  } else {
    const u = session.user;
    const avatar = u.user_metadata?.avatar_url || '';
    const name = u.user_metadata?.full_name || u.user_metadata?.user_name || '';
    const login = u.user_metadata?.user_name || '';
    area.innerHTML = `
      <div class="user-menu">
        <button class="user-pill" onclick="toggleDropdown()">
          <img src="${avatar}" alt="${login}" />
        </button>
        <div class="user-dropdown" id="userDropdown">
          <div class="dropdown-header">
            <div class="dropdown-name">${name}</div>
            <div class="dropdown-login">@${login}</div>
          </div>
          <button class="dropdown-item danger" onclick="signOut()">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M2 2.75C2 1.784 2.784 1 3.75 1h5.5a.75.75 0 0 1 0 1.5h-5.5a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h5.5a.75.75 0 0 1 0 1.5h-5.5A1.75 1.75 0 0 1 2 13.25Zm8.94 4.5-1.22-1.22a.75.75 0 1 1 1.06-1.06l2.5 2.5a.75.75 0 0 1 0 1.06l-2.5 2.5a.75.75 0 1 1-1.06-1.06l1.22-1.22H6.75a.75.75 0 0 1 0-1.5Z"/></svg>
            Sign out
          </button>
        </div>
      </div>`;
  }
}

function toggleDropdown() {
  document.getElementById('userDropdown')?.classList.toggle('open');
}

async function signIn() {
  await sb.auth.signInWithOAuth({ provider: 'github', options: { scopes: 'public_repo', redirectTo: REDIRECT } });
}

async function signOut() {
  await sb.auth.signOut();
}

function fmt(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n; }

function timeAgo(d) {
  const h = Math.floor((Date.now() - new Date(d)) / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return days < 30 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`;
}

function cardHTML(r) {
  const starred = userStars.has(r.id);
  const topics = (r.topics || []).slice(0, 5).map(t =>
    `<button class="c-topic" onclick="filterTopic('${t}')">${t}</button>`).join('');
  const langDot = r.language && LANG_COLORS[r.language]
    ? `<span class="lang-dot" style="background:${LANG_COLORS[r.language]}"></span><span class="c-stat">${r.language}</span>`
    : '';
  const trending = r.stargazers_count > 8000
    ? `<span class="c-trending">↑ trending</span>` : '';
  const starDis = session ? '' : 'disabled title="Sign in to star"';

  return `
<div class="card" id="card-${r.id}">
  <div class="card-body">
    <div class="card-author">
      <img class="c-avatar" src="${r.owner.avatar_url}" alt="${r.owner.login}" />
      <span class="c-owner"><a href="https://github.com/${r.owner.login}" target="_blank" rel="noopener">${r.owner.login}</a></span>
      ${trending}
    </div>
    <div class="c-name"><a href="${r.html_url}" target="_blank" rel="noopener">${r.name}</a></div>
    <div class="c-desc">${r.description || 'No description provided.'}</div>
    ${topics ? `<div class="c-topics">${topics}</div>` : ''}
  </div>
  <div class="card-footer">
    ${langDot}
    <span class="c-stat" style="margin-left:${langDot ? '10px' : '0'}">★ ${fmt(r.stargazers_count)}</span>
    <span class="c-stat" style="margin-left:10px">⑂ ${fmt(r.forks_count)}</span>
    <span class="c-stat" style="margin-left:10px;color:var(--text3)">${timeAgo(r.pushed_at)}</span>
    <div class="footer-actions">
      <button class="c-btn star-btn ${starred ? 'starred' : ''}" ${starDis} onclick="toggleStar(${r.id},'${r.full_name}',this)">
        ${starred ? '★' : '☆'} ${starred ? 'Starred' : 'Star'}
      </button>
      <button class="c-btn" onclick="openReadme('${r.full_name}','${r.default_branch || 'main'}')">README</button>
      <a class="c-btn" href="${r.html_url}" target="_blank" rel="noopener">View →</a>
    </div>
  </div>
</div>`;
}

async function toggleStar(repoId, fullName, btn) {
  if (!session || btn.disabled) return;
  btn.disabled = true;
  const wasStarred = userStars.has(repoId);
  const method = wasStarred ? 'DELETE' : 'PUT';

  try {
    await fetch(`https://api.github.com/user/starred/${fullName}`, {
      method,
      headers: { Authorization: `token ${githubToken}`, 'Content-Length': '0' }
    });

    if (wasStarred) {
      await sb.from('stars').delete().eq('user_id', session.user.id).eq('github_repo_id', repoId);
      userStars.delete(repoId);
      btn.classList.remove('starred');
      btn.innerHTML = '☆ Star';
    } else {
      await sb.from('stars').upsert({ user_id: session.user.id, github_repo_id: repoId, repo_full_name: fullName });
      userStars.add(repoId);
      btn.classList.add('starred');
      btn.innerHTML = '★ Starred';
    }
  } catch(e) { console.error(e); }
  btn.disabled = false;
}

function filterTopic(topic) {
  currentTopic = topic;
  currentQuery = '';
  document.getElementById('searchInput').value = '';
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  const match = [...document.querySelectorAll('.filter-btn')].find(b => b.dataset.topic === topic);
  if (match) match.classList.add('active');
  load(true);
}

async function fetchRepos(topic, query, page) {
  let q = query || (topic ? `topic:${topic}` : 'stars:>5000');
  const headers = { Accept: 'application/vnd.github+json' };
  if (githubToken) headers['Authorization'] = `token ${githubToken}`;
  const res = await fetch(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=10&page=${page}`,
    { headers }
  );
  if (!res.ok) throw new Error('rate-limited');
  const data = await res.json();
  return { items: data.items, total: data.total_count };
}

async function load(reset = false) {
  if (loading) return;
  if (reset) { currentPage = 1; hasMore = true; document.getElementById('feed').innerHTML = ''; }
  if (!hasMore) return;
  loading = true;

  const feed = document.getElementById('feed');
  if (reset) feed.innerHTML = '<div class="loading">Loading...</div>';

  try {
    const { items, total } = await fetchRepos(currentTopic, currentQuery, currentPage);
    if (reset) feed.innerHTML = '';
    feed.insertAdjacentHTML('beforeend', items.map(cardHTML).join(''));
    hasMore = currentPage * 10 < Math.min(total, 100);
    currentPage++;
  } catch {
    if (reset) feed.innerHTML = '<div class="error">Failed to load — GitHub API may be rate limited. Try again shortly.</div>';
  }
  loading = false;
}

function setupInfiniteScroll() {
  const sentinel = document.getElementById('sentinel');
  new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && hasMore && !loading) load();
  }, { rootMargin: '300px' }).observe(sentinel);
}

function setupModal() {
  const overlay = document.getElementById('modalOverlay');
  document.getElementById('modalClose').addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

async function openReadme(fullName, branch) {
  const overlay = document.getElementById('modalOverlay');
  const body = document.getElementById('modalBody');
  document.getElementById('modalTitle').textContent = `${fullName} — README`;
  body.innerHTML = '<div class="modal-loading">Loading README...</div>';
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  try {
    const branches = [branch, 'main', 'master'];
    let content = null;
    for (const b of branches) {
      const res = await fetch(`https://raw.githubusercontent.com/${fullName}/${b}/README.md`);
      if (res.ok) { content = await res.text(); break; }
    }
    if (!content) throw new Error('not found');
    body.innerHTML = marked.parse(content);
    body.querySelectorAll('img').forEach(img => {
      if (!img.src.startsWith('http')) {
        img.src = `https://raw.githubusercontent.com/${fullName}/${branch}/${img.getAttribute('src')}`;
      }
    });
  } catch {
    body.innerHTML = '<div class="modal-loading" style="color:var(--text3)">README not found for this repository.</div>';
  }
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

init();
