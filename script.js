const SUPABASE_URL = 'https://rirgluzzfkswzepigcgx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpcmdsdXp6Zmtzd3plcGlnY2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMTc0NDUsImV4cCI6MjA5NTc5MzQ0NX0.0xzyj34kibuzh_BDubg9s3Z-d3Qpw1zmMPrvEwbB6h0';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const LANG_COLORS = {JavaScript:'#f1e05a',TypeScript:'#3178c6',Python:'#3572A5',Go:'#00ADD8',Rust:'#dea584',Ruby:'#701516',Java:'#b07219','C++':'#f34b7d',C:'#555',Shell:'#89e051',Kotlin:'#A97BFF',Swift:'#F05138'};
const TOPICS = ['llm','rust','wasm','react','ai-agents','zig','bun','htmx','devops','cli'];

let session = null;
let githubToken = null;
let currentTopic = '';
let currentQuery = '';
let currentPage = 1;
let loading = false;
let hasMore = true;
let userStars = new Set();
let debounce;

async function init() {
  const { data } = await sb.auth.getSession();
  session = data.session;
  if (session) {
    githubToken = session.provider_token;
    await loadUserStars();
  }
  renderAuth();
  renderTopics();
  renderSidebar();
  load(true);

  sb.auth.onAuthStateChange((_e, s) => {
    session = s;
    githubToken = s?.provider_token || null;
    renderAuth();
    if (s) loadUserStars().then(() => load(true));
    else { userStars.clear(); load(true); }
  });

  setupInfiniteScroll();
}

async function loadUserStars() {
  if (!session) return;
  const { data } = await sb.from('stars').select('github_repo_id').eq('user_id', session.user.id);
  userStars = new Set((data || []).map(r => r.github_repo_id));
}

function renderAuth() {
  const area = document.getElementById('authArea');
  if (session) {
    const u = session.user;
    const avatar = u.user_metadata?.avatar_url || '';
    const login = u.user_metadata?.user_name || u.email;
    area.innerHTML = `<div class="user-pill" onclick="signOut()"><img src="${avatar}" />${login}</div>`;
  } else {
    area.innerHTML = `<button class="login-btn" onclick="signIn()"><svg width="14" height="14" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>Sign in with GitHub</button>`;
  }

  const uc = document.getElementById('userCard');
  if (session) {
    const u = session.user;
    const avatar = u.user_metadata?.avatar_url || '';
    const name = u.user_metadata?.full_name || u.user_metadata?.user_name || '';
    const login = u.user_metadata?.user_name || '';
    uc.innerHTML = `<div class="user-card"><img src="${avatar}" /><div><div class="user-name">${name}</div><div class="user-login">@${login}</div></div><button class="logout-btn" onclick="signOut()">Sign out</button></div>`;
  } else {
    uc.innerHTML = `<div class="sign-in-prompt"><p>Sign in to star repos directly from GitFeed</p><button class="login-btn" style="width:100%;justify-content:center" onclick="signIn()"><svg width="14" height="14" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>Sign in with GitHub</button></div>`;
  }
}

async function signIn() {
  await sb.auth.signInWithOAuth({
    provider: 'github',
    options: { scopes: 'public_repo', redirectTo: window.location.href }
  });
}

async function signOut() {
  await sb.auth.signOut();
}

function fmt(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n; }
function timeAgo(d) {
  const h = Math.floor((Date.now() - new Date(d)) / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return h + 'h ago';
  const days = Math.floor(h / 24);
  return days < 30 ? days + 'd ago' : Math.floor(days / 30) + 'mo ago';
}

function cardHTML(r) {
  const isStarred = userStars.has(r.id);
  const topics = (r.topics || []).slice(0, 4).map(t => `<span class="ctag" onclick="filterTopic('${t}')">${t}</span>`).join('');
  const langDot = r.language && LANG_COLORS[r.language] ? `<span class="lang-dot" style="background:${LANG_COLORS[r.language]}"></span>` : '';
  const trending = r.stargazers_count > 8000 ? `<span class="trending-badge">↑ trending</span>` : '';
  const starLabel = isStarred ? `★ ${fmt(r.stargazers_count)}` : `☆ ${fmt(r.stargazers_count)}`;
  const starDisabled = session ? '' : 'disabled title="Sign in to star"';

  return `
<div class="card" id="card-${r.id}">
  <div class="cm">
    <img class="cav" src="${r.owner.avatar_url}" alt="${r.owner.login}" />
    <span class="corg"><span>${r.owner.login}</span> / ${r.name}</span>
    ${trending}
  </div>
  <div class="ct"><a href="${r.html_url}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">${r.name}</a></div>
  <div class="cd">${r.description || 'No description provided.'}</div>
  ${topics ? `<div class="ctags">${topics}</div>` : ''}
  <div class="cstats">
    ${langDot}<span class="cs">${r.language || ''}</span>
    <span class="cs">⑂ ${fmt(r.forks_count)}</span>
    <span class="cs">${timeAgo(r.pushed_at)}</span>
    <button class="star-btn ${isStarred ? 'starred' : ''}" ${starDisabled} onclick="toggleStar(${r.id}, '${r.full_name}', this)">${starLabel}</button>
  </div>
</div>`;
}

async function toggleStar(repoId, fullName, btn) {
  if (!session) return;
  const isStarred = userStars.has(repoId);
  btn.disabled = true;

  try {
    if (isStarred) {
      await fetch(`https://api.github.com/user/starred/${fullName}`, { method: 'DELETE', headers: { Authorization: `token ${githubToken}`, 'Content-Length': '0' } });
      await sb.from('stars').delete().eq('user_id', session.user.id).eq('github_repo_id', repoId);
      userStars.delete(repoId);
      btn.classList.remove('starred');
      const cur = parseInt(btn.textContent.replace(/[^\d.k]/g, ''));
      btn.textContent = `☆ ${btn.textContent.trim().replace(/^[★☆]\s*/, '')}`;
    } else {
      await fetch(`https://api.github.com/user/starred/${fullName}`, { method: 'PUT', headers: { Authorization: `token ${githubToken}`, 'Content-Length': '0' } });
      await sb.from('stars').upsert({ user_id: session.user.id, github_repo_id: repoId, repo_full_name: fullName });
      userStars.add(repoId);
      btn.classList.add('starred');
      btn.textContent = `★ ${btn.textContent.trim().replace(/^[★☆]\s*/, '')}`;
    }
  } catch(e) {
    console.error(e);
  }
  btn.disabled = false;
}

async function fetchRepos(topic, query, page) {
  let q = query || (topic ? `topic:${topic}` : 'stars:>5000');
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=10&page=${page}`;
  const headers = { Accept: 'application/vnd.github+json' };
  if (githubToken) headers['Authorization'] = `token ${githubToken}`;
  const res = await fetch(url, { headers });
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
  const loadMore = document.getElementById('loadMore');
  loadMore.innerHTML = '<div class="loading">Loading...</div>';

  try {
    const { items, total } = await fetchRepos(currentTopic, currentQuery, currentPage);
    if (reset) feed.innerHTML = '';
    feed.insertAdjacentHTML('beforeend', items.map(cardHTML).join(''));
    hasMore = currentPage * 10 < Math.min(total, 100);
    currentPage++;
    loadMore.innerHTML = hasMore ? '<button class="load-more-btn" onclick="load()">Load more</button>' : '';
  } catch {
    loadMore.innerHTML = '<div class="error">Failed to load — GitHub API may be rate limited. Try again shortly.</div>';
  }
  loading = false;
}

function setupInfiniteScroll() {
  const observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && hasMore && !loading) load();
  }, { rootMargin: '200px' });
  observer.observe(document.getElementById('loadMore'));
}

function filterTopic(topic) {
  currentTopic = topic;
  currentQuery = '';
  document.getElementById('searchInput').value = '';
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  const match = [...document.querySelectorAll('.chip')].find(c => c.dataset.topic === topic);
  if (match) match.classList.add('active');
  load(true);
}

function renderTopics() {
  document.getElementById('topics').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentTopic = chip.dataset.topic;
    currentQuery = '';
    document.getElementById('searchInput').value = '';
    load(true);
  });
}

function renderSidebar() {
  document.getElementById('ttags').innerHTML = TOPICS.map(t =>
    `<span class="tt" onclick="filterTopic('${t}')">${t}</span>`
  ).join('');
}

document.getElementById('searchInput').addEventListener('input', e => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    currentQuery = e.target.value.trim();
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    if (!currentQuery) {
      document.querySelector('.chip[data-topic=""]').classList.add('active');
    }
    load(true);
  }, 400);
});

document.querySelectorAll('.nl').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nl').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

init();
