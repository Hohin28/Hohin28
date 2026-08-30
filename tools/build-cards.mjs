#!/usr/bin/env node
// Generates the four analytics cards from live GitHub data.
//
// These used to come from github-readme-stats.vercel.app, github-profile-trophy
// and github-readme-activity-graph. All three public demo deployments are now
// suspended (503 DEPLOYMENT_PAUSED / 402 DEPLOYMENT_DISABLED), which is why they
// rendered as broken images. Committing real SVGs removes the dependency.
//
//   GITHUB_TOKEN=$(gh auth token) node tools/build-cards.mjs
//
// The GitHub Action in .github/workflows/refresh-cards.yml reruns this weekly.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOGIN = process.env.PROFILE_LOGIN || 'Hohin28';
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error('  GITHUB_TOKEN is not set.  Try:  GITHUB_TOKEN=$(gh auth token) node tools/build-cards.mjs');
  process.exit(1);
}

/* ------------------------------------------------------------------ theme
   Lifted from the existing cards so these four sit in the same family. */
const T = {
  teal: '#00F5D4',
  cyan: '#00B4D8',
  text: '#F8FAFC',
  body: '#CDD9E5',
  muted: '#94A3B8',
  dim: '#64748B',
  panel: '#0D1117',
  hair: '#FFFFFF14',
  mono: "'SFMono-Regular',Consolas,Menlo,monospace",
  sans: "-apple-system,'Segoe UI',sans-serif",
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n = v => (Math.round(v * 100) / 100).toString();

/* ------------------------------------------------------------------- data */
const QUERY = `query($login: String!) {
  user(login: $login) {
    name login createdAt
    followers { totalCount }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false, orderBy: {field: STARGAZERS, direction: DESC}) {
      totalCount
      nodes {
        stargazerCount forkCount
        languages(first: 12, orderBy: {field: SIZE, direction: DESC}) {
          edges { size node { name color } }
        }
      }
    }
    contributionsCollection {
      totalCommitContributions
      restrictedContributionsCount
      totalPullRequestContributions
      totalIssueContributions
      totalRepositoriesWithContributedCommits
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
    pullRequests(first: 1) { totalCount }
    issues(first: 1) { totalCount }
  }
}`;

async function fetchUser() {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'profile-card-builder',
    },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data.user;
}

/* ------------------------------------------------------------------ chrome
   Same frame as card-about.svg: shadowed panel, gradient hairline border,
   traffic lights, right-aligned command, rule at y=50. */
function frame(w, h, command, inner, extraDefs = '') {
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" width="100%" role="img" aria-label="${esc(command)}">
  <defs>
    <linearGradient id="bd" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${T.teal}" stop-opacity="0.9"/>
      <stop offset="50%" stop-color="${T.cyan}" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="${T.teal}" stop-opacity="0.9"/>
    </linearGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%" filterUnits="objectBoundingBox">
      <feDropShadow dx="0" dy="8" stdDeviation="14" flood-color="#000000" flood-opacity="0.4"/>
    </filter>${extraDefs}
  </defs>
  <g filter="url(#sh)">
    <rect x="3" y="3" width="${w - 6}" height="${h - 6}" rx="16" fill="${T.panel}" fill-opacity="0.94" stroke="${T.hair}" stroke-width="1"/>
  </g>
  <rect x="3" y="3" width="${w - 6}" height="${h - 6}" rx="16" fill="none" stroke="url(#bd)" stroke-width="1" stroke-opacity="0.28"/>

  <circle cx="30" cy="29" r="5.5" fill="#FF5F56"/>
  <circle cx="48" cy="29" r="5.5" fill="#FFBD2E"/>
  <circle cx="66" cy="29" r="5.5" fill="#27C93F"/>
  <text x="${w - 24}" y="33" text-anchor="end" font-family="${T.mono}" font-size="12.5" fill="${T.muted}">${esc(command)}</text>
  <line x1="1" y1="50" x2="${w - 1}" y2="50" stroke="${T.hair}" stroke-width="1"/>
${inner}
</svg>
`;
}

/* ------------------------------------------------------------------- icons
   Drawn from primitives rather than pasted path data, so every glyph is
   actually the shape it claims to be. 16x16 box, scaled by the caller. */
function starPoints(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * 0.42 : r;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${n(cx + rad * Math.cos(a))},${n(cy + rad * Math.sin(a))}`);
  }
  return pts.join(' ');
}

const ICON = {
  star: c => `<polygon points="${starPoints(8, 8.2, 7.4)}" fill="${c}"/>`,
  // git commit: node on a horizontal line
  commit: c => `<g stroke="${c}" stroke-width="1.9" fill="none" stroke-linecap="round">
      <path d="M0.6 8h4.1M11.3 8h4.1"/><circle cx="8" cy="8" r="3.2"/></g>`,
  // pull request: source branch curving into a target branch
  pr: c => `<g stroke="${c}" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 6.2v7.1M12 9.4v3.9M4 5.2 A1.6 1.6 0 1 1 4 5.19M4 14.9 A1.6 1.6 0 1 1 4 14.89M12 14.9 A1.6 1.6 0 1 1 12 14.89"/>
      <path d="M12 8.6V3.4h-2.6M12 3.4 10.6 2M12 3.4 10.6 4.8"/></g>`,
  issue: c => `<g stroke="${c}" stroke-width="1.9" fill="none"><circle cx="8" cy="8" r="6.6"/></g>
      <circle cx="8" cy="8" r="1.9" fill="${c}"/>`,
  // repository: a book with a spine
  repo: c => `<g stroke="${c}" stroke-width="1.7" fill="none" stroke-linejoin="round">
      <path d="M3 2.4h9.4a0.9 0.9 0 0 1 0.9 0.9v9.1H4.4A1.4 1.4 0 0 0 3 13.8Z"/>
      <path d="M3 13.8a1.4 1.4 0 0 1 1.4-1.4h8.9v1.9H4.4A1.4 1.4 0 0 1 3 12.9"/></g>`,
  // two people
  people: c => `<g fill="${c}"><circle cx="6" cy="5.4" r="2.9"/>
      <path d="M0.9 14.4c0-2.9 2.3-4.6 5.1-4.6s5.1 1.7 5.1 4.6z"/>
      <circle cx="12.2" cy="6.1" r="2.2" opacity="0.72"/>
      <path d="M9.6 10.6c2.6-0.7 5.5 0.5 5.5 3.8h-3.6c0-1.5-0.7-2.9-1.9-3.8z" opacity="0.72"/></g>`,
  // contributed to: box with an outgoing arrow
  box: c => `<g stroke="${c}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M13.4 8.9v5.1H2.6V3.2h5.2"/><path d="M10.4 2.3h3.9v3.9M14.3 2.3 8.3 8.3"/></g>`,
  // repo forked: two heads dropping into one
  fork: c => `<g stroke="${c}" stroke-width="1.9" fill="none" stroke-linecap="round">
      <circle cx="4" cy="3.6" r="1.8"/><circle cx="12" cy="3.6" r="1.8"/><circle cx="8" cy="12.6" r="1.8"/>
      <path d="M4 5.4v1.4a2.1 2.1 0 0 0 2.1 2.1h3.8A2.1 2.1 0 0 0 12 6.8V5.4M8 8.9v1.9"/></g>`,
};

function statRow(x, y, icon, label, value, color) {
  return `  <g transform="translate(${x},${y})">
    <g transform="translate(0,-12) scale(1.15)">${ICON[icon](color)}</g>
    <text x="34" y="0" font-family="${T.sans}" font-size="14.5" fill="${T.body}">${esc(label)}</text>
    <text x="272" y="0" text-anchor="end" font-family="${T.mono}" font-size="15" font-weight="600" fill="${T.text}">${esc(value)}</text>
  </g>`;
}

/* -------------------------------------------------------------- card: stats */
function cardStats(u) {
  const c = u.contributionsCollection;
  const stars = u.repositories.nodes.reduce((s, r) => s + r.stargazerCount, 0);
  const forks = u.repositories.nodes.reduce((s, r) => s + r.forkCount, 0);
  const commits = c.totalCommitContributions + c.restrictedContributionsCount;
  const year = new Date().getFullYear();

  // Monthly totals from the contribution calendar, for the right-hand chart.
  const days = c.contributionCalendar.weeks.flatMap(w => w.contributionDays);
  const buckets = new Map();
  for (const d of days) {
    const k = d.date.slice(0, 7);
    buckets.set(k, (buckets.get(k) ?? 0) + d.contributionCount);
  }
  const months = [...buckets.entries()].slice(-12);
  const peak = Math.max(1, ...months.map(m => m[1]));

  const W = 1180, H = 296;
  const cx0 = 660, cw = 1152 - cx0, base = 246, top = 96;
  const bw = cw / months.length;

  const bars = months.map(([key, val], i) => {
    const h = (val / peak) * (base - top);
    const x = cx0 + i * bw + bw * 0.18;
    const w = bw * 0.64;
    const y = base - h;
    const label = new Date(key + '-02').toLocaleString('en', { month: 'short' });
    return `    <rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(Math.max(h, 1.5))}" rx="2.5" fill="url(#barG)"/>
    <text x="${n(x + w / 2)}" y="${base + 18}" text-anchor="middle" font-family="${T.mono}" font-size="10.5" fill="${T.dim}">${label}</text>`;
  }).join('\n');

  const defs = `
    <linearGradient id="barG" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${T.teal}" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="${T.cyan}" stop-opacity="0.30"/>
    </linearGradient>`;

  const inner = `  <text x="28" y="84" font-family="${T.mono}" font-size="15" fill="${T.teal}">${esc(u.name)} <tspan fill="${T.dim}">@${esc(u.login)}</tspan></text>

${statRow(28, 126, 'star', 'Total stars earned', stars, T.teal)}
${statRow(28, 164, 'commit', `Total commits (${year})`, commits, T.teal)}
${statRow(28, 202, 'pr', 'Total pull requests', u.pullRequests.totalCount, T.teal)}
${statRow(28, 240, 'issue', 'Total issues', u.issues.totalCount, T.teal)}
${statRow(336, 126, 'repo', 'Public repositories', u.repositories.totalCount, T.cyan)}
${statRow(336, 164, 'box', 'Contributed to', c.totalRepositoriesWithContributedCommits, T.cyan)}
${statRow(336, 202, 'people', 'Followers', u.followers.totalCount, T.cyan)}
${statRow(336, 240, 'fork', 'Forks earned', forks, T.cyan)}

  <line x1="628" y1="72" x2="628" y2="264" stroke="${T.hair}" stroke-width="1"/>
  <text x="${cx0}" y="76" font-family="${T.mono}" font-size="12.5" fill="${T.muted}">contributions by month</text>
  <text x="1152" y="76" text-anchor="end" font-family="${T.mono}" font-size="12.5" fill="${T.teal}">${c.contributionCalendar.totalContributions} total</text>
  <line x1="${cx0}" y1="${base + 0.5}" x2="1152" y2="${base + 0.5}" stroke="${T.hair}" stroke-width="1"/>
${bars}`;

  return frame(W, H, '$ gh api /users/' + u.login, inner, defs);
}

/* -------------------------------------------------------------- card: langs */
function cardLangs(u) {
  const totals = new Map();
  for (const r of u.repositories.nodes) {
    for (const e of r.languages.edges) {
      const cur = totals.get(e.node.name) ?? { size: 0, color: e.node.color || T.muted };
      cur.size += e.size;
      totals.set(e.node.name, cur);
    }
  }
  const all = [...totals.entries()].sort((a, b) => b[1].size - a[1].size);
  const grand = all.reduce((s, [, l]) => s + l.size, 0) || 1;
  const top = all.slice(0, 8);

  const W = 1180, H = 256;
  const barX = 28, barW = 1124, barY = 92, barH = 14;

  let cursor = barX;
  const segs = top.map(([, l], i) => {
    const w = (l.size / grand) * barW;
    const first = i === 0, last = i === top.length - 1;
    const r = first || last ? barH / 2 : 0;
    // Only the outermost segments get rounded ends, so the bar reads as one pill.
    const seg = `    <path d="M${n(cursor + (first ? r : 0))} ${barY}
        h${n(Math.max(w - (first ? r : 0) - (last ? r : 0), 0.5))}
        ${last ? `a${r} ${r} 0 0 1 0 ${barH}` : `v${barH}`}
        h-${n(Math.max(w - (first ? r : 0) - (last ? r : 0), 0.5))}
        ${first ? `a${r} ${r} 0 0 1 0 -${barH}` : `v-${barH}`}Z"
        fill="${l.color}"/>`.replace(/\s+/g, ' ');
    cursor += w;
    return seg;
  }).join('\n');

  const legend = top.map(([name, l], i) => {
    const col = i % 2, row = (i / 2) | 0;
    const x = 28 + col * 566, y = 148 + row * 30;
    const pct = ((l.size / grand) * 100).toFixed(1) + '%';
    return `  <g transform="translate(${x},${y})">
    <circle cx="7" cy="-5" r="6.5" fill="${l.color}"/>
    <text x="24" y="0" font-family="${T.sans}" font-size="14.5" fill="${T.body}">${esc(name)}</text>
    <text x="520" y="0" text-anchor="end" font-family="${T.mono}" font-size="14" fill="${T.text}">${pct}</text>
  </g>`;
  }).join('\n');

  const inner = `  <text x="28" y="78" font-family="${T.mono}" font-size="13" fill="${T.muted}">weighted by bytes across ${u.repositories.totalCount} public repositories</text>
${segs}
${legend}`;

  return frame(W, H, '$ ls tech-stack/ --by-bytes', inner);
}

/* ----------------------------------------------------------- card: trophies
   github-profile-trophy grades each category against fixed thresholds. Same
   idea here, plus the next threshold, so a low rank reads as progress rather
   than as an empty slot. */
const LADDER = [
  { rank: 'C', at: 0 }, { rank: 'B', at: 10 }, { rank: 'A', at: 50 },
  { rank: 'AA', at: 200 }, { rank: 'AAA', at: 500 },
  { rank: 'S', at: 1000 }, { rank: 'SS', at: 3000 }, { rank: 'SSS', at: 10000 },
];

function grade(value, scale) {
  const v = value / scale;
  let i = 0;
  while (i + 1 < LADDER.length && v >= LADDER[i + 1].at) i++;
  const next = LADDER[i + 1];
  return {
    rank: LADDER[i].rank,
    next: next ? Math.ceil(next.at * scale) : null,
    frac: next ? Math.min(1, (v - LADDER[i].at) / (next.at - LADDER[i].at)) : 1,
  };
}

function cardTrophies(u) {
  const c = u.contributionsCollection;
  const stars = u.repositories.nodes.reduce((s, r) => s + r.stargazerCount, 0);
  const years = Math.max(
    0,
    (Date.now() - new Date(u.createdAt)) / (365.25 * 24 * 3600 * 1000)
  );

  const items = [
    { label: 'Commits', value: c.totalCommitContributions + c.restrictedContributionsCount, scale: 1 },
    { label: 'Repositories', value: u.repositories.totalCount, scale: 1 },
    { label: 'Followers', value: u.followers.totalCount, scale: 1 },
    { label: 'Stars', value: stars, scale: 1 },
    { label: 'Pull Requests', value: u.pullRequests.totalCount, scale: 1 },
    { label: 'Issues', value: u.issues.totalCount, scale: 1 },
    { label: 'Experience', value: +years.toFixed(1), scale: 0.5, unit: 'yr' },
  ];

  const W = 1180, H = 214;
  const pad = 28, gap = 14;
  const tw = (W - pad * 2 - gap * (items.length - 1)) / items.length;

  const tiles = items.map((it, i) => {
    const g = grade(it.value, it.scale);
    const x = pad + i * (tw + gap);
    const cx = x + tw / 2;
    const R = 26, CIRC = 2 * Math.PI * R;
    const shown = it.unit ? `${it.value}${it.unit}` : it.value;
    const foot = g.next === null ? 'max tier' : `next ${g.next}${it.unit ?? ''}`;
    return `  <g>
    <rect x="${n(x)}" y="72" width="${n(tw)}" height="118" rx="12" fill="#FFFFFF08" stroke="${T.hair}" stroke-width="1"/>
    <circle cx="${n(cx)}" cy="112" r="${R}" fill="none" stroke="#FFFFFF14" stroke-width="4"/>
    <circle cx="${n(cx)}" cy="112" r="${R}" fill="none" stroke="${T.teal}" stroke-width="4" stroke-linecap="round"
            stroke-dasharray="${n(CIRC)}" stroke-dashoffset="${n(CIRC * (1 - g.frac))}"
            transform="rotate(-90 ${n(cx)} 112)" opacity="0.9"/>
    <text x="${n(cx)}" y="118" text-anchor="middle" font-family="${T.mono}" font-size="17" font-weight="700" fill="${T.teal}">${g.rank}</text>
    <text x="${n(cx)}" y="158" text-anchor="middle" font-family="${T.sans}" font-size="13" fill="${T.body}">${esc(it.label)}</text>
    <text x="${n(cx)}" y="177" text-anchor="middle" font-family="${T.mono}" font-size="12" fill="${T.text}">${shown} <tspan fill="${T.dim}">· ${foot}</tspan></text>
  </g>`;
  }).join('\n');

  return frame(W, H, '$ cat trophies.json', tiles);
}

/* ----------------------------------------------------------- card: activity
   Catmull-Rom through the daily totals, converted to cubic beziers, so the
   area curve is smooth instead of a jagged polyline. */
function smoothPath(pts, yMin, yMax) {
  if (pts.length < 2) return '';
  // Catmull-Rom overshoots on either side of a sharp spike. Unclamped that
  // pushes control points below the axis, i.e. negative contributions, and the
  // area fill bleeds under the baseline. Clamp to the plot band.
  const cl = y => Math.min(yMax, Math.max(yMin, y));
  let d = `M${n(pts[0][0])} ${n(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i], p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, cl(p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, cl(p2[1] - (p3[1] - p1[1]) / 6)];
    d += `C${n(c1[0])} ${n(c1[1])},${n(c2[0])} ${n(c2[1])},${n(p2[0])} ${n(p2[1])}`;
  }
  return d;
}

function cardActivity(u) {
  const cal = u.contributionsCollection.contributionCalendar;
  const weeks = cal.weeks.map(w => ({
    date: w.contributionDays[0].date,
    total: w.contributionDays.reduce((s, d) => s + d.contributionCount, 0),
  }));

  const W = 1180, H = 340;
  const L = 64, R = 1152, TOP = 92, BASE = 268;
  const peak = Math.max(1, ...weeks.map(w => w.total));
  const step = (R - L) / (weeks.length - 1);
  const pts = weeks.map((w, i) => [L + i * step, BASE - (w.total / peak) * (BASE - TOP)]);

  const line = smoothPath(pts, TOP, BASE);
  const area = `${line}L${n(R)} ${BASE}L${n(L)} ${BASE}Z`;

  // y gridlines at 0 / 50% / 100% of the peak week
  const grid = [0, 0.5, 1].map(f => {
    const y = BASE - f * (BASE - TOP);
    return `  <line x1="${L}" y1="${n(y)}" x2="${R}" y2="${n(y)}" stroke="${T.hair}" stroke-width="1"/>
  <text x="${L - 12}" y="${n(y + 4)}" text-anchor="end" font-family="${T.mono}" font-size="11" fill="${T.dim}">${Math.round(f * peak)}</text>`;
  }).join('\n');

  // one label per month change
  let last = '';
  const xlab = weeks.map((w, i) => {
    const m = w.date.slice(0, 7);
    if (m === last || i === 0) { last = m; return null; }
    last = m;
    const d = new Date(w.date);
    return `  <text x="${n(L + i * step)}" y="${BASE + 22}" text-anchor="middle" font-family="${T.mono}" font-size="11" fill="${T.dim}">${d.toLocaleString('en', { month: 'short' })}</text>`;
  }).filter(Boolean).join('\n');

  const busiest = weeks.reduce((a, b) => (b.total > a.total ? b : a));
  const defs = `
    <linearGradient id="areaG" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${T.teal}" stop-opacity="0.50"/>
      <stop offset="100%" stop-color="${T.teal}" stop-opacity="0.02"/>
    </linearGradient>
    <linearGradient id="lineG" gradientUnits="userSpaceOnUse" x1="${L}" y1="0" x2="${R}" y2="0">
      <stop offset="0%" stop-color="${T.teal}"/>
      <stop offset="100%" stop-color="${T.cyan}"/>
    </linearGradient>`;

  const inner = `  <text x="28" y="78" font-family="${T.mono}" font-size="13" fill="${T.muted}">contributions per week · last ${weeks.length} weeks</text>
  <text x="1152" y="78" text-anchor="end" font-family="${T.mono}" font-size="13" fill="${T.teal}">${cal.totalContributions} contributions</text>
${grid}
  <path d="${area}" fill="url(#areaG)"/>
  <path d="${line}" fill="none" stroke="url(#lineG)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
${xlab}
  <line x1="${L}" y1="${BASE + 0.5}" x2="${R}" y2="${BASE + 0.5}" stroke="${T.hair}" stroke-width="1"/>
  <text x="28" y="${BASE + 52}" font-family="${T.mono}" font-size="12" fill="${T.dim}">peak week ${busiest.date} · ${busiest.total} contributions</text>`;

  return frame(W, H, '$ tail -f activity.log', inner, defs);
}

/* -------------------------------------------------------------------- main */
const user = await fetchUser();
const cards = {
  'card-stats.svg': cardStats(user),
  'card-langs.svg': cardLangs(user),
  'card-trophies.svg': cardTrophies(user),
  'card-activity.svg': cardActivity(user),
};

for (const [name, svg] of Object.entries(cards)) {
  writeFileSync(join(ROOT, name), svg);
  console.log(`  ${name.padEnd(20)} ${String(Buffer.byteLength(svg)).padStart(6)} bytes`);
}
console.log(`\n  generated for @${user.login} at ${new Date().toISOString()}`);
