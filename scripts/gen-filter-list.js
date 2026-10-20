#!/usr/bin/env node
/**
 * Regenerates Interface/src/assets/filter_list.json from the latest GitHub
 * releases of every filter declared as a submodule of Bevara/filters.
 *
 * This reproduces what the VS Code extension does at runtime
 * (BevaraUnpreservedEditor.initFiltersList + Credentials.parseReleaseAssets),
 * so the file shipped to the web build stays in sync with the released filters.
 *
 * Usage:
 *   node scripts/gen-filter-list.js [options]
 *
 *   --out <path>       output file (default: Interface/src/assets/filter_list.json)
 *   --local            read .gitmodules from Interface/player/filters instead of GitHub
 *   --only <a,b,c>     restrict to these repositories
 *   --include-disabled include filters listed in DISABLED (off by default)
 *   --concurrency <n>  parallel repositories (default: 8)
 *   --dry-run          print the result instead of writing it
 *   --verbose          log every request
 *
 * Auth: uses $GITHUB_TOKEN / $GH_TOKEN, else falls back to `gh auth token`.
 * A token is effectively required: ~90 repositories means a few hundred API
 * calls, well over the 60/hour unauthenticated limit.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const FILTERS_OWNER = 'Bevara';
const FILTERS_REPO = 'filters';
const FILTERS_REF = 'master';
const DEFAULT_OUT = path.join(REPO_ROOT, 'Interface', 'src', 'assets', 'filter_list.json');
const LOCAL_GITMODULES = path.join(REPO_ROOT, 'Interface', 'player', 'filters', '.gitmodules');
const API = 'https://api.github.com';

// Filters kept out of the generated list. ffdmx advertises fourteen container
// and codec formats, so the editor recommended it for nearly every input and
// emitted it next to the filter that actually decodes the stream. It also
// imports libavdevice and libavfilter symbols that no module provides, so it
// throws from its own init as soon as it is loaded.
const DISABLED = new Set(['ffdmx']);

function parseArgs(argv) {
	const opts = { out: DEFAULT_OUT, local: false, only: null, concurrency: 8, dryRun: false, verbose: false, includeDisabled: false };
	for (let i = 0; i < argv.length; i++) {
		switch (argv[i]) {
			case '--out': opts.out = path.resolve(argv[++i]); break;
			case '--local': opts.local = true; break;
			case '--only': opts.only = argv[++i].split(',').map(s => s.trim()).filter(Boolean); break;
			case '--concurrency': opts.concurrency = Math.max(1, parseInt(argv[++i], 10)); break;
			case '--include-disabled': opts.includeDisabled = true; break;
			case '--dry-run': opts.dryRun = true; break;
			case '--verbose': opts.verbose = true; break;
			case '-h': case '--help':
				console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n/, ''));
				process.exit(0);
				break;
			default:
				console.error(`Unknown option: ${argv[i]}`);
				process.exit(2);
		}
	}
	return opts;
}

function getToken() {
	if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
	if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
	try {
		return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
	} catch {
		return null;
	}
}

const opts = parseArgs(process.argv.slice(2));
const token = getToken();
if (!token) {
	console.warn('! No GitHub token found (GITHUB_TOKEN, GH_TOKEN or `gh auth token`).');
	console.warn('! Falling back to unauthenticated requests: expect rate-limit errors.');
}

function log(...args) { if (opts.verbose) console.error(...args); }

async function gh(url, accept = 'application/vnd.github+json') {
	const headers = { accept, 'user-agent': 'bevara-gen-filter-list', 'x-github-api-version': '2022-11-28' };
	if (token) headers.authorization = `Bearer ${token}`;
	log(`GET ${url}`);
	const res = await fetch(url.startsWith('http') ? url : API + url, { headers });
	if (!res.ok) {
		const remaining = res.headers.get('x-ratelimit-remaining');
		const hint = remaining === '0' ? ' (rate limit exhausted)' : '';
		throw new Error(`${res.status} ${res.statusText}${hint} for ${url}`);
	}
	return res;
}

/** Minimal .gitmodules parser -> [{ name, path, url }] */
function parseGitmodules(content) {
	const modules = [];
	let current = null;
	for (const rawLine of content.split('\n')) {
		const line = rawLine.trim();
		const section = line.match(/^\[submodule\s+"(.+)"\]$/);
		if (section) {
			current = { name: section[1], path: null, url: null };
			modules.push(current);
			continue;
		}
		if (!current) continue;
		const kv = line.match(/^(\w+)\s*=\s*(.+)$/);
		if (kv && (kv[1] === 'path' || kv[1] === 'url')) current[kv[1]] = kv[2].trim();
	}
	return modules;
}

async function readGitmodules() {
	if (opts.local) {
		log(`Reading ${LOCAL_GITMODULES}`);
		return parseGitmodules(fs.readFileSync(LOCAL_GITMODULES, 'utf8'));
	}
	const res = await gh(`/repos/${FILTERS_OWNER}/${FILTERS_REPO}/contents/.gitmodules?ref=${FILTERS_REF}`);
	const body = await res.json();
	return parseGitmodules(Buffer.from(body.content, 'base64').toString('utf8'));
}

/** https://github.com/Owner/Repo.git -> { owner, repo } */
function splitRepoUrl(url) {
	const end = url.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
	const [owner, repo] = end.split('/');
	return owner && repo ? { owner, repo } : null;
}

/**
 * Latest release of a repository -> { "<name>_<version>.wasm": <descriptor> }
 * Mirrors Credentials.parseReleaseAssets().
 */
async function filtersOfRepo(owner, repo) {
	const releases = await (await gh(`/repos/${owner}/${repo}/releases?per_page=1`)).json();
	if (releases.length === 0) {
		console.warn(`- ${owner}/${repo}: no release, skipped`);
		return {};
	}
	const release = releases[0];
	const assets = release.assets || [];
	const binaries = assets.filter(a => a.name.endsWith('.wasm'));
	const descs = assets.filter(a => a.name.endsWith('.json'));
	if (binaries.length === 0) {
		console.warn(`- ${owner}/${repo}: release ${release.tag_name} has no .wasm asset, skipped`);
		return {};
	}

	const filters = {};
	for (const binary of binaries) {
		const base = path.parse(binary.name).name;
		const desc = descs.find(d => path.parse(d.name).name === base);
		if (!desc) {
			console.warn(`- ${owner}/${repo}: no ${base}.json next to ${binary.name}, skipped`);
			continue;
		}
		const raw = await (await gh(`/repos/${owner}/${repo}/releases/assets/${desc.id}`, 'application/octet-stream')).text();
		let descriptor;
		try {
			descriptor = JSON.parse(raw);
		} catch (err) {
			console.warn(`- ${owner}/${repo}: ${desc.name} is not valid JSON, skipped (${err.message})`);
			continue;
		}
		descriptor.sources = release.zipball_url;
		descriptor.binaries = binary.id;
		descriptor.owner = owner;
		descriptor.repo = repo;
		filters[binary.name] = descriptor;
	}
	console.error(`+ ${owner}/${repo} @ ${release.tag_name}: ${Object.keys(filters).join(', ') || 'nothing'}`);
	return filters;
}

/** Runs `worker` over `items` with at most `limit` in flight. */
async function mapLimit(items, limit, worker) {
	const results = new Array(items.length);
	let next = 0;
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (next < items.length) {
			const i = next++;
			results[i] = await worker(items[i]);
		}
	}));
	return results;
}

async function main() {
	const modules = await readGitmodules();
	let repos = modules
		.filter(m => m.path !== 'third_parties' && m.url)
		.map(m => splitRepoUrl(m.url))
		.filter(Boolean);
	if (opts.only) repos = repos.filter(r => opts.only.includes(r.repo));
	if (!opts.includeDisabled) {
		const skipped = repos.filter(r => DISABLED.has(r.repo)).map(r => r.repo);
		repos = repos.filter(r => !DISABLED.has(r.repo));
		if (skipped.length > 0) console.error(`Disabled, left out of the list: ${skipped.join(', ')}`);
	}
	if (repos.length === 0) {
		console.error('No repository to process.');
		process.exit(1);
	}
	console.error(`Fetching latest releases of ${repos.length} repositories...`);

	const failures = [];
	const parts = await mapLimit(repos, opts.concurrency, async ({ owner, repo }) => {
		try {
			return await filtersOfRepo(owner, repo);
		} catch (err) {
			console.warn(`! ${owner}/${repo}: ${err.message}`);
			failures.push(`${owner}/${repo}`);
			return {};
		}
	});

	const merged = Object.assign({}, ...parts);
	const sorted = {};
	for (const key of Object.keys(merged).sort()) sorted[key] = merged[key];
	const json = JSON.stringify(sorted, null, 2) + '\n';

	if (opts.dryRun) {
		process.stdout.write(json);
	} else {
		fs.writeFileSync(opts.out, json);
		console.error(`Wrote ${Object.keys(sorted).length} filters to ${path.relative(process.cwd(), opts.out)}`);
	}

	if (failures.length > 0) {
		console.error(`Failed repositories (${failures.length}): ${failures.join(', ')}`);
		process.exit(1);
	}
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
