const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const BASE = ['send_1', 'send_2', 'lightning_1', 'transfer_2', 'boost_2'];
const RULES = [
  { name: 'hardware', match: /hardware|trezor|jade/i, ids: /^hardware_wallet_/ },
  { name: 'lnurl', match: /lnurl/i, ids: /^lnurl_/ },
  {
    name: 'addresses',
    match: /multi.?address|address.?type|address.?viewer|utxo|coin.?selection/i,
    ids: /^(multi_address_|onchain_|boost_)/,
  },
  {
    name: 'fees',
    match: /boost|cpfp|rbf|fee|transaction.?speed/i,
    ids: /^(boost_|onchain_|send_)/,
  },
  {
    name: 'onboarding',
    match: /onboarding|mnemonic|seedqr|passphrase|backup|restore|recovery|migration/i,
    ids: /^(onboarding_|backup_|security_|migration_(?!setup)|settings_07)/,
    migration: true,
  },
  {
    name: 'security',
    match: /security|privacy|pin(code|pad)?|biometric|keychain|authcheck/i,
    ids: /^(security_|settings_06|settings_07|send_)/,
  },
  {
    name: 'pubky-paykit',
    match: /pubky|paykit|contact|profile|subscription|allowance|payment.?request|marketplace|shop/i,
    ids: /^(pubky_profile_|paykit_)/,
    staging: true,
  },
  {
    name: 'receive',
    match: /receive|invoice|scanner|qrscann/i,
    ids: /^(receive_|numberpad_|send_|onchain_|lnurl_)/,
  },
  {
    name: 'send',
    match: /send|quickpay|amount|numberpad/i,
    ids: /^(send_|numberpad_|onchain_|boost_|lnurl_)/,
  },
  {
    name: 'lightning',
    match: /lightning|channel|transfer|connection/i,
    ids: /^(lightning_|transfer_|multi_address_|send_|lnurl_)/,
  },
  { name: 'settings', match: /settings|electrum|gossip|currency|denomination/i, ids: /^settings_/ },
  { name: 'widgets', match: /widget/i, ids: /^widgets_/ },
];
// Shared services, dependencies, routing and unknown paths expand rather than guess.
const BROAD =
  /(^|\/)(services?|repositories|managers|data|models|helpers|navigation|utilities|extensions)(\/|$)|appscene|appviewmodel|mainnav|mainactivity|lightningrepo|\.github\/|\.gradle|gradle\/|Package\.(swift|resolved)|project\.pbxproj|\.xcconfig|\.toml$|\.properties$|usdt|bitkit.?core|ldk/i;
const DOCUMENTATION =
  /^(docs?\/|journeys\/|changelog\.d\/)|(^|\/)(README|CHANGELOG|AGENTS|CLAUDE)\.md$|\.md$/i;

function select(cases, { platform, mode = 'auto', files = [], shards = 1, release = false }) {
  if (!['ios', 'android'].includes(platform)) throw Error('Invalid platform');
  if (!['auto', 'base', 'full', 'nightly'].includes(mode)) throw Error('Invalid selection mode');
  if (![1, 2].includes(shards)) throw Error('Only one or two shards are supported');
  if (!Array.isArray(files) || files.some((f) => typeof f !== 'string' || !f || f.includes('\0')))
    throw Error('Invalid changed paths');
  const runnable = cases.filter(
    (c) => c.kind === 'test' && c.platforms[platform].disposition === 'required'
  );
  for (const id of BASE)
    if (!runnable.some((c) => c.id === id && c.platforms[platform].backend === 'local'))
      throw Error(`Missing base case: ${id}`);
  const local = runnable.filter((c) => c.platforms[platform].backend === 'local');
  const selected = new Set(BASE);
  const reasons = [];
  let broad = ['full', 'nightly'].includes(mode);
  let staging = broad,
    migration = broad || release;
  const changed = files.filter((f) => !DOCUMENTATION.test(f));
  const code = mode !== 'auto' || changed.length > 0 || release;
  if (mode === 'auto')
    for (const file of changed) {
      const rules = RULES.filter((r) => r.match.test(file));
      if (BROAD.test(file) || rules.length === 0) {
        broad = true;
        reasons.push({ file, rule: 'broad-or-unclassified' });
      } else
        for (const rule of rules) {
          for (const c of runnable) if (rule.ids.test(c.id)) selected.add(c.id);
          staging ||= !!rule.staging;
          migration ||= !!rule.migration;
          reasons.push({ file, rule: rule.name });
        }
    }
  if (broad) {
    for (const c of local) selected.add(c.id);
    staging = true;
    migration = true;
  }
  const ids = code
    ? local
        .filter((c) => selected.has(c.id))
        .map((c) => c.id)
        .sort()
    : [];
  // Keep a spec's cases together: before hooks can own a wallet shared by sibling cases.
  const bins = Array.from({ length: shards }, () => []);
  const specs = [...new Set(local.filter((c) => ids.includes(c.id)).map((c) => c.file))].sort();
  for (const file of specs) {
    const group = local.filter((c) => c.file === file && ids.includes(c.id)).map((c) => c.id);
    bins.sort((a, b) => a.length - b.length);
    bins[0].push(...group);
  }
  const matrix = bins
    .filter((b) => b.length)
    .map((ids, i) => ({ name: `local-${i + 1}`, ids: ids.sort() }));
  return {
    schemaVersion: 1,
    platform,
    mode,
    code,
    base: BASE,
    ids,
    matrix,
    staging: code && staging,
    migration: code && migration,
    reasons,
    gaps: cases
      .filter((c) => c.platforms[platform].disposition === 'gap')
      .map((c) => ({ id: c.id, ...c.platforms[platform] })),
  };
}

if (require.main === module) {
  const app = path.resolve(process.env.E2E_APP_ROOT || '.');
  const git = (...args) => execFileSync('git', ['-C', app, ...args], { encoding: 'utf8' }).trim();
  const tested = git('rev-parse', 'HEAD');
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const pr = event.pull_request;
  const manualPr = process.env.E2E_MANUAL_PR;
  let base = pr?.base?.sha;
  if (manualPr) {
    if (!/^\d+$/.test(manualPr)) throw Error('Invalid PR number');
    const current = JSON.parse(
      execFileSync('gh', ['api', `repos/${process.env.GITHUB_REPOSITORY}/pulls/${manualPr}`], {
        encoding: 'utf8',
      })
    );
    base = current.base.sha;
    if (git('show', '-s', '--format=%P', 'HEAD') !== `${base} ${current.head.sha}`)
      throw Error('Manual PR merge does not match current base and head');
  } else if (pr && git('show', '-s', '--format=%P', 'HEAD') !== `${base} ${pr.head.sha}`)
    throw Error('PR merge does not match event base and head');
  const files = base
    ? execFileSync('git', ['-C', app, 'diff', '--no-renames', '--name-only', '-z', base, tested], {
        encoding: 'utf8',
      })
        .split('\0')
        .filter(Boolean)
    : [];
  const mode =
    process.env.GITHUB_EVENT_NAME === 'schedule'
      ? 'nightly'
      : process.env.GITHUB_EVENT_NAME === 'pull_request'
        ? 'auto'
        : process.env.E2E_SELECTION || 'full';
  if (mode === 'auto' && !base) throw Error('Automatic manual selection requires a PR number');
  const shards =
    process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' ? Number(process.env.E2E_SHARDS || 1) : 1;
  const inventory = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../test/inventory.json'), 'utf8')
  );
  const result = select(inventory.cases, {
    platform: process.env.PLATFORM,
    mode,
    files,
    shards,
    release: /^release-/.test(pr?.head?.ref || '') || /^release-/.test(pr?.base?.ref || ''),
  });
  result.appSha = tested;
  result.e2eSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  }).trim();
  fs.writeFileSync('selection.json', JSON.stringify(result, null, 2) + '\n');
  if (process.env.GITHUB_OUTPUT)
    for (const key of ['code', 'matrix', 'staging', 'migration', 'appSha', 'e2eSha'])
      fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
        `${key}=${typeof result[key] === 'object' ? JSON.stringify(result[key]) : result[key]}\n`
      );
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## E2E selection\n\nApp: ${tested}; tests: ${result.e2eSha}\n\nLocal cases (${result.ids.length}): ${result.ids.join(', ') || 'none'}\n\nStaging: ${result.staging}; migration: ${result.migration}; shards: ${result.matrix.length}\n\n${result.reasons.map((r) => `- ${r.file}: ${r.rule}`).join('\n')}\n\nKnown gaps (not counted as passes): ${result.gaps.map((g) => g.id).join(', ')}\n`
    );
  console.log(JSON.stringify(result, null, 2));
}
module.exports = { BASE, RULES, select };
