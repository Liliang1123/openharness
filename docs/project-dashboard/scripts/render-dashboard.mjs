#!/usr/bin/env node

/**
 * render-dashboard.mjs
 *
 * 从 development-log.json 生成：
 *   - development-log.md（人类可读总台账）
 *   - index.html（静态可视化入口，浏览器直接打开）
 *
 * 运行要求：Node.js >= 18，无第三方依赖。
 * 调用方式：node docs/project-dashboard/scripts/render-dashboard.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIR = join(__dirname, '..');
const JSON_PATH = join(DASHBOARD_DIR, 'development-log.json');
const MD_PATH = join(DASHBOARD_DIR, 'development-log.md');
const HTML_PATH = join(DASHBOARD_DIR, 'index.html');
const CHECK_MODE = process.argv.includes('--check');

// ── Load data ───────────────────────────────────────────────────────────────

const raw = readFileSync(JSON_PATH, 'utf-8');
const data = JSON.parse(raw);
validateDashboardData(data);
const { project, entries } = data;

// ── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_EMOJI = {
  proposed: '📋',
  verified: '✅',
  archived: '📦',
  blocked: '🚫',
  superseded: '🔄',
  partial: '⚠️',
};

function statusBadge(status) {
  return `${STATUS_EMOJI[status] || '❓'} ${status}`;
}

function link(label, path) {
  if (!path) return '—';
  return `[${label}](${path})`;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function validateDashboardData(value) {
  const errors = [];
  const statuses = new Set(['proposed', 'verified', 'archived', 'blocked', 'superseded', 'partial']);
  const results = new Set(['passed', 'failed', 'skipped', 'blocked', 'not-run']);
  const types = new Set(['feature', 'bugfix', 'docs', 'tooling', 'refactor', 'test']);

  function add(path, message) {
    errors.push(`${path}: ${message}`);
  }

  function isObject(candidate) {
    return candidate !== null && typeof candidate === 'object' && !Array.isArray(candidate);
  }

  function requireObject(candidate, path) {
    if (!isObject(candidate)) {
      add(path, 'must be an object');
      return false;
    }
    return true;
  }

  function requireString(candidate, path, { allowEmpty = false } = {}) {
    if (typeof candidate !== 'string') {
      add(path, 'must be a string');
      return false;
    }
    if (!allowEmpty && candidate.length === 0) {
      add(path, 'must not be empty');
      return false;
    }
    return true;
  }

  function requireArray(candidate, path) {
    if (!Array.isArray(candidate)) {
      add(path, 'must be an array');
      return false;
    }
    return true;
  }

  function checkAllowedKeys(candidate, path, allowed) {
    for (const key of Object.keys(candidate)) {
      if (!allowed.includes(key)) {
        add(`${path}.${key}`, 'unknown field');
      }
    }
  }

  function checkDate(candidate, path) {
    if (!requireString(candidate, path)) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
      add(path, 'must match YYYY-MM-DD');
      return;
    }
    const date = new Date(`${candidate}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== candidate) {
      add(path, 'must be a real calendar date');
    }
  }

  function checkStringArray(candidate, path) {
    if (!requireArray(candidate, path)) return;
    const seen = new Set();
    candidate.forEach((item, index) => {
      if (requireString(item, `${path}[${index}]`) && seen.has(item)) {
        add(`${path}[${index}]`, `duplicate value "${item}"`);
      }
      seen.add(item);
    });
  }

  function checkPathArray(candidate, path) {
    checkStringArray(candidate, path);
  }

  if (!requireObject(value, '$')) {
    failValidation(errors);
  }
  checkAllowedKeys(value, '$', ['schemaVersion', 'project', 'entries']);
  if (value.schemaVersion !== 1) add('$.schemaVersion', 'must be 1');

  if (requireObject(value.project, '$.project')) {
    checkAllowedKeys(value.project, '$.project', ['name', 'root', 'updatedAt']);
    requireString(value.project.name, '$.project.name');
    requireString(value.project.root, '$.project.root');
    checkDate(value.project.updatedAt, '$.project.updatedAt');
  }

  if (requireArray(value.entries, '$.entries')) {
    if (value.entries.length === 0) add('$.entries', 'must contain at least one entry');
    const changeIds = new Map();
    value.entries.forEach((entry, index) => {
      const path = `$.entries[${index}]`;
      if (!requireObject(entry, path)) return;
      checkAllowedKeys(entry, path, [
        'changeId',
        'title',
        'status',
        'date',
        'type',
        'summary',
        'tags',
        'openspec',
        'superpowers',
        'implementation',
        'verification',
        'closeout',
        'next',
        'nonGoals',
        'notes',
      ]);

      if (requireString(entry.changeId, `${path}.changeId`)) {
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.changeId)) {
          add(`${path}.changeId`, 'must be kebab-case');
        }
        if (changeIds.has(entry.changeId)) {
          add(`${path}.changeId`, `duplicates ${changeIds.get(entry.changeId)}`);
        }
        changeIds.set(entry.changeId, path);
      }
      requireString(entry.title, `${path}.title`);
      if (requireString(entry.status, `${path}.status`) && !statuses.has(entry.status)) {
        add(`${path}.status`, `must be one of ${Array.from(statuses).join(', ')}`);
      }
      checkDate(entry.date, `${path}.date`);
      if (entry.type !== undefined && requireString(entry.type, `${path}.type`) && !types.has(entry.type)) {
        add(`${path}.type`, `must be one of ${Array.from(types).join(', ')}`);
      }
      requireString(entry.summary, `${path}.summary`);
      if (entry.tags !== undefined) checkStringArray(entry.tags, `${path}.tags`);
      if (entry.next !== undefined) checkStringArray(entry.next, `${path}.next`);
      if (entry.nonGoals !== undefined) checkStringArray(entry.nonGoals, `${path}.nonGoals`);
      if (entry.notes !== undefined) checkStringArray(entry.notes, `${path}.notes`);

      checkOpenSpec(entry.openspec, `${path}.openspec`, { optional: entry.openspec === undefined });
      checkSuperpowers(entry.superpowers, `${path}.superpowers`, { optional: entry.superpowers === undefined });
      checkImplementation(entry.implementation, `${path}.implementation`, { optional: entry.implementation === undefined });
      checkVerification(entry.verification, `${path}.verification`, { optional: entry.verification === undefined });
      checkNullablePath(entry.closeout, `${path}.closeout`, { optional: entry.closeout === undefined });

      if (entry.status === 'archived') {
        requireArchivedEntry(entry, path);
      }
      if (entry.status === 'verified' && (!Array.isArray(entry.verification) || entry.verification.length === 0)) {
        add(`${path}.verification`, 'verified entries must include at least one verification result');
      }
      if (entry.status === 'proposed' && !entry.openspec?.proposal) {
        add(`${path}.openspec.proposal`, 'proposed entries must include proposal path');
      }
    });
  }

  failValidation(errors);

  function checkNullablePath(candidate, path, { optional = false } = {}) {
    if (candidate === undefined && optional) return;
    if (candidate === null) return;
    requireString(candidate, path);
  }

  function checkOpenSpec(candidate, path, { optional = false } = {}) {
    if (candidate === undefined && optional) return;
    if (!requireObject(candidate, path)) return;
    checkAllowedKeys(candidate, path, ['proposal', 'design', 'tasks', 'specDeltas', 'currentSpecs', 'archivePath']);
    checkNullablePath(candidate.proposal, `${path}.proposal`, { optional: candidate.proposal === undefined });
    checkNullablePath(candidate.design, `${path}.design`, { optional: candidate.design === undefined });
    checkNullablePath(candidate.tasks, `${path}.tasks`, { optional: candidate.tasks === undefined });
    if (candidate.specDeltas !== undefined) checkPathArray(candidate.specDeltas, `${path}.specDeltas`);
    if (candidate.currentSpecs !== undefined) checkPathArray(candidate.currentSpecs, `${path}.currentSpecs`);
    if (candidate.archivePath !== undefined) {
      requireString(candidate.archivePath, `${path}.archivePath`);
      if (!/^openspec\/changes\/archive\/\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(candidate.archivePath)) {
        add(`${path}.archivePath`, 'must point to openspec/changes/archive/YYYY-MM-DD-change-id');
      }
    }
  }

  function checkSuperpowers(candidate, path, { optional = false } = {}) {
    if (candidate === undefined && optional) return;
    if (!requireObject(candidate, path)) return;
    checkAllowedKeys(candidate, path, ['plan']);
    checkNullablePath(candidate.plan, `${path}.plan`, { optional: candidate.plan === undefined });
  }

  function checkImplementation(candidate, path, { optional = false } = {}) {
    if (candidate === undefined && optional) return;
    if (!requireObject(candidate, path)) return;
    checkAllowedKeys(candidate, path, ['sourceFiles', 'testFiles']);
    if (candidate.sourceFiles !== undefined) checkPathArray(candidate.sourceFiles, `${path}.sourceFiles`);
    if (candidate.testFiles !== undefined) checkPathArray(candidate.testFiles, `${path}.testFiles`);
  }

  function checkVerification(candidate, path, { optional = false } = {}) {
    if (candidate === undefined && optional) return;
    if (!requireArray(candidate, path)) return;
    candidate.forEach((item, index) => {
      const itemPath = `${path}[${index}]`;
      if (!requireObject(item, itemPath)) return;
      checkAllowedKeys(item, itemPath, ['command', 'result', 'note']);
      requireString(item.command, `${itemPath}.command`);
      if (requireString(item.result, `${itemPath}.result`) && !results.has(item.result)) {
        add(`${itemPath}.result`, `must be one of ${Array.from(results).join(', ')}`);
      }
      if (item.note !== undefined) requireString(item.note, `${itemPath}.note`, { allowEmpty: true });
    });
  }

  function requireArchivedEntry(entry, path) {
    if (!entry.openspec?.archivePath) add(`${path}.openspec.archivePath`, 'archived entries must include archivePath');
    if (!entry.openspec?.proposal) add(`${path}.openspec.proposal`, 'archived entries must include proposal path');
    if (!entry.openspec?.tasks) add(`${path}.openspec.tasks`, 'archived entries must include tasks path');
    if (!Array.isArray(entry.openspec?.specDeltas) || entry.openspec.specDeltas.length === 0) {
      add(`${path}.openspec.specDeltas`, 'archived entries must include at least one spec delta path');
    }
    if (!Array.isArray(entry.openspec?.currentSpecs)) {
      add(`${path}.openspec.currentSpecs`, 'archived entries must include currentSpecs array');
    }
    if (!Array.isArray(entry.verification) || entry.verification.length === 0) {
      add(`${path}.verification`, 'archived entries must include at least one verification result');
    }
    if (!entry.closeout) add(`${path}.closeout`, 'archived entries must include closeout path');
  }
}

function failValidation(errors) {
  if (errors.length === 0) return;
  console.error('❌ development-log.json validation failed:');
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

// ── Sort entries by date (newest first) ─────────────────────────────────────

const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));

// ── Generate Markdown ───────────────────────────────────────────────────────

function generateMarkdown() {
  const lines = [];
  lines.push(`# ${project.name} — 开发导航台`);
  lines.push('');
  lines.push(`> 自动生成，请勿直接编辑。数据源：\`development-log.json\`  `);
  lines.push(`> 最后更新：${project.updatedAt}`);
  lines.push('');

  // Timeline
  lines.push('## Timeline');
  lines.push('');
  const byDate = {};
  for (const e of sorted) {
    (byDate[e.date] ??= []).push(e);
  }
  for (const [date, items] of Object.entries(byDate)) {
    lines.push(`### ${date}`);
    lines.push('');
    for (const e of items) {
      lines.push(`- ${statusBadge(e.status)} **${e.changeId}** — ${e.summary || 'no summary'}`);
    }
    lines.push('');
  }

  // Feature Matrix
  lines.push('## Feature Matrix');
  lines.push('');
  lines.push('| 功能点 | 状态 | Spec | Plan | Code | Tests | Closeout |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const e of sorted) {
    const specs = (e.openspec?.currentSpecs || e.openspec?.specDeltas || [])
      .map(s => s.split('/').slice(-2, -1)[0])
      .join(', ') || '—';
    const plan = e.superpowers?.plan ? link('plan', e.superpowers.plan) : '—';
    const code = (e.implementation?.sourceFiles || []).length > 0
      ? `${e.implementation.sourceFiles.length} files`
      : '—';
    const tests = (e.implementation?.testFiles || []).length > 0
      ? `${e.implementation.testFiles.length} files`
      : '—';
    const closeout = e.closeout ? link('closeout', e.closeout) : '—';
    lines.push(`| ${e.changeId} | ${statusBadge(e.status)} | ${specs} | ${plan} | ${code} | ${tests} | ${closeout} |`);
  }
  lines.push('');

  // Bug 定位索引
  lines.push('## Bug 定位索引（按 Tag）');
  lines.push('');
  const byTag = {};
  for (const e of sorted) {
    for (const tag of (e.tags || [])) {
      (byTag[tag] ??= []).push(e);
    }
  }
  for (const [tag, items] of Object.entries(byTag).sort()) {
    lines.push(`### ${tag}`);
    lines.push('');
    for (const e of items) {
      lines.push(`- ${statusBadge(e.status)} ${e.changeId}`);
    }
    lines.push('');
  }

  // Next Work Queue
  lines.push('## Next Work Queue');
  lines.push('');
  const allNext = sorted.flatMap(e => (e.next || []).map(n => ({ from: e.changeId, item: n })));
  if (allNext.length > 0) {
    lines.push('### 推荐下一步');
    lines.push('');
    for (const n of allNext) {
      lines.push(`- ${n.item} _(from ${n.from})_`);
    }
    lines.push('');
  }
  const allNonGoals = sorted.flatMap(e => (e.nonGoals || []).map(n => ({ from: e.changeId, item: n })));
  if (allNonGoals.length > 0) {
    lines.push('### 暂不建议');
    lines.push('');
    for (const n of allNonGoals) {
      lines.push(`- ${n.item} _(from ${n.from})_`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── Generate HTML ───────────────────────────────────────────────────────────

function generateHtml() {
  // Build table rows
  const tableRows = sorted.map(e => {
    const specs = (e.openspec?.currentSpecs || e.openspec?.specDeltas || [])
      .map(s => s.split('/').slice(-2, -1)[0])
      .join(', ') || '—';
    const plan = e.superpowers?.plan
      ? `<a href="${escapeHtml(e.superpowers.plan)}">${escapeHtml(e.superpowers.plan.split('/').pop())}</a>`
      : '—';
    const code = (e.implementation?.sourceFiles || []).length > 0
      ? e.implementation.sourceFiles.map(f => escapeHtml(f.split('/').pop())).join(', ')
      : '—';
    const tests = (e.implementation?.testFiles || []).length > 0
      ? e.implementation.testFiles.map(f => escapeHtml(f.split('/').pop())).join(', ')
      : '—';
    const closeout = e.closeout
      ? `<a href="${escapeHtml(e.closeout)}">${escapeHtml(e.closeout.split('/').pop())}</a>`
      : '—';
    const next = (e.next || []).map(n => escapeHtml(n)).join('<br>') || '—';

    return `<tr>
      <td><strong>${escapeHtml(e.changeId)}</strong></td>
      <td><span class="badge badge-${e.status}">${escapeHtml(e.status)}</span></td>
      <td>${escapeHtml(e.date)}</td>
      <td>${escapeHtml(specs)}</td>
      <td>${plan}</td>
      <td>${code}</td>
      <td>${tests}</td>
      <td>${closeout}</td>
      <td>${next}</td>
    </tr>`;
  }).join('\n');

  // Build timeline
  const byDate = {};
  for (const e of sorted) {
    (byDate[e.date] ??= []).push(e);
  }
  const timelineHtml = Object.entries(byDate)
    .map(([date, items]) => `
      <div class="timeline-group">
        <div class="timeline-date">${escapeHtml(date)}</div>
        <div class="timeline-items">
          ${items.map(e => `<div class="timeline-item">
            <span class="badge badge-${e.status}">${escapeHtml(e.status)}</span>
            <strong>${escapeHtml(e.changeId)}</strong>
            <span class="summary">${escapeHtml(e.summary || '')}</span>
          </div>`).join('\n')}
        </div>
      </div>`)
    .join('\n');

  // Build tag index
  const byTag = {};
  for (const e of sorted) {
    for (const tag of (e.tags || [])) {
      (byTag[tag] ??= []).push(e);
    }
  }
  const tagHtml = Object.entries(byTag).sort()
    .map(([tag, items]) => `
      <div class="tag-group">
        <h3>${escapeHtml(tag)}</h3>
        <ul>
          ${items.map(e => `<li><span class="badge badge-${e.status}">${escapeHtml(e.status)}</span> ${escapeHtml(e.changeId)}</li>`).join('\n')}
        </ul>
      </div>`)
    .join('\n');

  // Build next work queue
  const allNext = sorted.flatMap(e => (e.next || []).map(n => ({ from: e.changeId, item: n })));
  const allNonGoals = sorted.flatMap(e => (e.nonGoals || []).map(n => ({ from: e.changeId, item: n })));

  const nextHtml = allNext.length > 0
    ? `<h3>推荐下一步</h3><ul>${allNext.map(n => `<li>${escapeHtml(n.item)} <em>(from ${escapeHtml(n.from)})</em></li>`).join('\n')}</ul>`
    : '<p>无推荐下一步</p>';

  const nonGoalsHtml = allNonGoals.length > 0
    ? `<h3>暂不建议</h3><ul>${allNonGoals.map(n => `<li>${escapeHtml(n.item)} <em>(from ${escapeHtml(n.from)})</em></li>`).join('\n')}</ul>`
    : '';

  // Stats
  const stats = {
    total: entries.length,
    archived: entries.filter(e => e.status === 'archived').length,
    partial: entries.filter(e => e.status === 'partial').length,
    proposed: entries.filter(e => e.status === 'proposed').length,
    verified: entries.filter(e => e.status === 'verified').length,
  };

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(project.name)} — 开发导航台</title>
  <style>
    :root {
      --bg: #0f1117;
      --surface: #1a1d27;
      --surface-hover: #22263a;
      --border: #2a2e3e;
      --text: #e1e4ed;
      --text-muted: #8b8fa7;
      --accent: #6c8cff;
      --accent-glow: rgba(108, 140, 255, 0.15);
      --green: #34d399;
      --amber: #fbbf24;
      --red: #f87171;
      --purple: #a78bfa;
      --cyan: #22d3ee;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans SC', sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2rem;
    }

    header {
      text-align: center;
      margin-bottom: 2.5rem;
      padding: 2rem;
      background: linear-gradient(135deg, var(--surface), var(--bg));
      border: 1px solid var(--border);
      border-radius: 16px;
    }

    header h1 {
      font-size: 2rem;
      background: linear-gradient(135deg, var(--accent), var(--cyan));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 0.5rem;
    }

    header .meta {
      color: var(--text-muted);
      font-size: 0.875rem;
    }

    .stats {
      display: flex;
      gap: 1rem;
      justify-content: center;
      flex-wrap: wrap;
      margin-top: 1rem;
    }

    .stat {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 0.75rem 1.25rem;
      text-align: center;
      min-width: 100px;
    }

    .stat .number {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--accent);
    }

    .stat .label {
      font-size: 0.75rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    nav {
      display: flex;
      gap: 0.5rem;
      justify-content: center;
      margin-bottom: 2rem;
      flex-wrap: wrap;
    }

    nav button {
      background: var(--surface);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.5rem 1.25rem;
      cursor: pointer;
      font-size: 0.875rem;
      transition: all 0.2s;
    }

    nav button:hover, nav button.active {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
      box-shadow: 0 0 12px var(--accent-glow);
    }

    section {
      display: none;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      animation: fadeIn 0.3s ease-in;
    }

    section.active { display: block; }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    h2 {
      font-size: 1.25rem;
      margin-bottom: 1rem;
      color: var(--accent);
    }

    h3 {
      font-size: 1rem;
      margin: 1rem 0 0.5rem;
      color: var(--text);
    }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .badge-archived { background: rgba(52, 211, 153, 0.15); color: var(--green); }
    .badge-verified { background: rgba(108, 140, 255, 0.15); color: var(--accent); }
    .badge-proposed { background: rgba(251, 191, 36, 0.15); color: var(--amber); }
    .badge-blocked { background: rgba(248, 113, 113, 0.15); color: var(--red); }
    .badge-superseded { background: rgba(167, 139, 250, 0.15); color: var(--purple); }
    .badge-partial { background: rgba(251, 191, 36, 0.1); color: var(--amber); }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }

    th {
      text-align: left;
      padding: 0.75rem 0.5rem;
      border-bottom: 2px solid var(--border);
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
      font-size: 0.7rem;
      letter-spacing: 0.05em;
    }

    td {
      padding: 0.6rem 0.5rem;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }

    tr:hover td { background: var(--surface-hover); }

    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }

    .timeline-group {
      display: flex;
      gap: 1rem;
      margin-bottom: 1.25rem;
      padding-bottom: 1.25rem;
      border-bottom: 1px solid var(--border);
    }

    .timeline-date {
      min-width: 100px;
      font-weight: 700;
      color: var(--accent);
      font-size: 0.9rem;
      padding-top: 0.25rem;
    }

    .timeline-items { flex: 1; }

    .timeline-item {
      padding: 0.35rem 0;
      display: flex;
      gap: 0.5rem;
      align-items: baseline;
      flex-wrap: wrap;
    }

    .timeline-item .summary {
      color: var(--text-muted);
      font-size: 0.85rem;
    }

    .tag-group ul {
      list-style: none;
      padding-left: 0;
    }

    .tag-group li {
      padding: 0.25rem 0;
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    ul { padding-left: 1.25rem; }
    li { margin-bottom: 0.25rem; }
    em { color: var(--text-muted); font-size: 0.8rem; }

    .auto-gen {
      text-align: center;
      color: var(--text-muted);
      font-size: 0.75rem;
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
    }

    @media (max-width: 768px) {
      body { padding: 1rem; }
      header h1 { font-size: 1.5rem; }
      .stats { gap: 0.5rem; }
      .stat { min-width: 80px; padding: 0.5rem 0.75rem; }
      .timeline-group { flex-direction: column; gap: 0.25rem; }
      table { font-size: 0.75rem; }
    }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(project.name)} — 开发导航台</h1>
    <div class="meta">自动生成，请勿直接编辑 · 数据源：development-log.json · 最后更新：${escapeHtml(project.updatedAt)}</div>
    <div class="stats">
      <div class="stat"><div class="number">${stats.total}</div><div class="label">Total</div></div>
      <div class="stat"><div class="number">${stats.archived}</div><div class="label">Archived</div></div>
      <div class="stat"><div class="number">${stats.partial}</div><div class="label">Partial</div></div>
      <div class="stat"><div class="number">${stats.proposed}</div><div class="label">Proposed</div></div>
      <div class="stat"><div class="number">${stats.verified}</div><div class="label">Verified</div></div>
    </div>
  </header>

  <nav>
    <button class="active" onclick="show(event, 'timeline')">Timeline</button>
    <button onclick="show(event, 'matrix')">Feature Matrix</button>
    <button onclick="show(event, 'bugs')">Bug 定位索引</button>
    <button onclick="show(event, 'next')">Next Work Queue</button>
  </nav>

  <section id="timeline" class="active">
    <h2>Timeline</h2>
    ${timelineHtml}
  </section>

  <section id="matrix">
    <h2>Feature Matrix</h2>
    <div style="overflow-x:auto">
    <table>
      <thead>
        <tr>
          <th>功能点</th><th>状态</th><th>日期</th><th>Spec</th><th>Plan</th><th>Code</th><th>Tests</th><th>Closeout</th><th>Next</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
    </div>
  </section>

  <section id="bugs">
    <h2>Bug 定位索引（按 Tag）</h2>
    ${tagHtml}
  </section>

  <section id="next">
    <h2>Next Work Queue</h2>
    ${nextHtml}
    ${nonGoalsHtml}
  </section>

  <div class="auto-gen">
    自动生成 · node docs/project-dashboard/scripts/render-dashboard.mjs
  </div>

  <script>
    function show(event, id) {
      document.querySelectorAll('section').forEach(s => s.classList.remove('active'));
      document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
      document.getElementById(id).classList.add('active');
      event.currentTarget.classList.add('active');
    }
  </script>
</body>
</html>`;
}

// ── Write outputs ───────────────────────────────────────────────────────────

const md = generateMarkdown();
const html = generateHtml();

if (CHECK_MODE) {
  assertGeneratedOutputCurrent(MD_PATH, md);
  assertGeneratedOutputCurrent(HTML_PATH, html);
  console.log('✅ Dashboard generated outputs are current');
} else {
  writeFileSync(MD_PATH, md, 'utf-8');
  console.log(`✅ Generated ${MD_PATH}`);

  writeFileSync(HTML_PATH, html, 'utf-8');
  console.log(`✅ Generated ${HTML_PATH}`);
}

console.log(`\n📊 ${entries.length} entries (${entries.filter(e => e.status === 'archived').length} archived, ${entries.filter(e => e.status === 'partial').length} partial)`);

function assertGeneratedOutputCurrent(path, expected) {
  const actual = readFileSync(path, 'utf-8');
  if (actual !== expected) {
    console.error(`❌ ${path} is stale. Run: node docs/project-dashboard/scripts/render-dashboard.mjs`);
    process.exit(1);
  }
}
