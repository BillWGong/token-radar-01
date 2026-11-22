// Token Radar dashboard: renders window.RADAR (written by main.ts as
// data.js). No network, no framework. Sortable, filterable, with a
// detail view for every protocol on the board.

const R = window.RADAR;
const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtUsd(v) {
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + String(Math.round(v));
}

function fmtPct(v) {
  if (v === null || v === undefined) return '<span class="sub">—</span>';
  const cls = v >= 0 ? 'up' : 'down';
  return '<span class="' + cls + '">' + (v >= 0 ? '+' : '') + v.toFixed(1) + '%</span>';
}

const state = { q: '', cat: '', wl: false, sort: 'rank', selected: null };

function visibleRows() {
  const q = state.q.trim().toLowerCase();
  let rows = R.rows.filter((r) => {
    if (state.wl && !r.is_watchlist) return false;
    if (state.cat && r.category !== state.cat) return false;
    if (q && !(r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q))) return false;
    return true;
  });
  const by = {
    rank: (a, b) => a.rank - b.rank,
    implied: (a, b) => b.implied_value_usd - a.implied_value_usd,
    tvl: (a, b) => b.tvl_usd - a.tvl_usd,
    change: (a, b) => (b.change_7d ?? -1e9) - (a.change_7d ?? -1e9),
    age: (a, b) => b.age_years - a.age_years,
  };
  rows = rows.slice().sort(by[state.sort] || by.rank);
  return rows;
}

function renderMeta() {
  $('meta').textContent =
    'Snapshot ' + R.as_of + ' · ' + R.rows.length + ' protocols ranked · watchlist floor ' + fmtUsd(R.floor_usd) + ' TVL';
  const top = R.rows[0];
  $('stats').innerHTML =
    stat(R.rows.length, 'protocols ranked') +
    stat(R.model.watchlist_size, 'on the watchlist') +
    stat(R.model.global_multiple.toFixed(3) + 'x', 'global mcap / TVL median') +
    stat(top ? fmtUsd(top.implied_value_usd) : '—', 'top implied value · ' + (top ? esc(top.name) : ''));
  $('method').textContent = 'Method: ' + R.model.formula + '.';
  const catSel = $('cat');
  catSel.innerHTML = '<option value="">All categories</option>' +
    R.categories.map((c) => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('');
  $('liveRows').innerHTML = R.live.map((p) =>
    '<tr><td>' + esc(p.name) + ' <span class="sub">' + esc(p.slug) + '</span></td>' +
    '<td>' + esc(p.category || '—') + '</td>' +
    '<td class="num">' + fmtUsd(p.tvl_usd) + '</td>' +
    '<td class="num">' + fmtUsd(p.mcap_usd) + '</td>' +
    '<td class="num">' + p.ratio.toFixed(3) + 'x</td></tr>'
  ).join('');
}

function stat(value, label) {
  return '<div class="stat"><b>' + value + '</b><span>' + label + '</span></div>';
}

function renderRows() {
  const rows = visibleRows();
  $('rows').innerHTML = rows.map((r) =>
    '<tr data-slug="' + esc(r.slug) + '" class="' + (state.selected === r.slug ? 'sel' : '') + '">' +
    '<td class="num">' + r.rank + '</td>' +
    '<td>' + esc(r.name) + (r.is_watchlist ? '<span class="badge">WATCHLIST</span>' : '') +
    ' <span class="sub">' + esc(r.slug) + '</span></td>' +
    '<td>' + esc(r.category || '—') + '</td>' +
    '<td>' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
    '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
    '<td class="num">' + fmtPct(r.change_7d) + '</td>' +
    '<td class="num">' + r.age_years.toFixed(1) + 'y</td>' +
    '<td class="num"><b>' + fmtUsd(r.implied_value_usd) + '</b></td></tr>'
  ).join('');
  $('count').textContent = rows.length + ' of ' + R.rows.length + ' protocols shown';
}

function renderDetail() {
  const box = $('detail');
  const r = R.rows.find((row) => row.slug === state.selected);
  if (!r) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
  box.innerHTML =
    '<h2>' + esc(r.name) + (r.is_watchlist ? '<span class="badge">WATCHLIST</span>' : '') +
    ' <span class="sub">' + esc(r.slug) + ' · rank #' + r.rank + '</span></h2>' +
    '<div class="grid">' +
    '<div class="cell"><b>' + fmtUsd(r.implied_value_usd) + '</b><span>implied value</span></div>' +
    '<div class="cell"><b>' + fmtUsd(r.tvl_usd) + '</b><span>TVL</span></div>' +
    '<div class="cell"><b>' + r.multiple.toFixed(3) + 'x</b><span>category multiple (' + esc(r.category || 'global') + ')</span></div>' +
    '<div class="cell"><b>' + r.growth.toFixed(2) + 'x</b><span>growth factor</span></div>' +
    '<div class="cell"><b>' + r.maturity.toFixed(2) + 'x</b><span>maturity factor</span></div>' +
    '<div class="cell"><b>' + esc(r.chains.join(', ')) + '</b><span>chains</span></div>' +
    '</div>' +
    '<p class="formula">' + fmtUsd(r.tvl_usd) + ' TVL × ' + r.multiple.toFixed(3) + ' multiple × ' +
    r.growth.toFixed(2) + ' growth × ' + r.maturity.toFixed(2) + ' maturity = ' +
    fmtUsd(r.implied_value_usd) + ' implied value. ' + esc(r.name) +
    ' records no token; the value is this board\u2019s claim, not a price.</p>' +
    '<h3>How to farm it</h3><ol>' +
    r.farm_steps.map((s, i) => '<li><b>Step ' + (i + 1) + '.</b> ' + esc(s) + '</li>').join('') +
    '</ol>';
}

function render() {
  if (state.selected && !visibleRows().some((r) => r.slug === state.selected)) state.selected = null;
  renderRows();
  renderDetail();
}

$('q').addEventListener('input', (e) => { state.q = e.target.value; render(); });
$('cat').addEventListener('change', (e) => { state.cat = e.target.value; render(); });
$('wl').addEventListener('change', (e) => { state.wl = e.target.checked; render(); });
$('sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
$('rows').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-slug]');
  if (!tr) return;
  state.selected = state.selected === tr.dataset.slug ? null : tr.dataset.slug;
  render();
});

renderMeta();
render();
