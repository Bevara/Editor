#!/usr/bin/env node
/**
 * Regenerates the file selector of the "bevara.pipeline" custom editor in
 * package.json from the extensions the accessors of the Bevara registry
 * declare - the accessors the extension lists at runtime. VS Code reads the
 * selector from package.json before any code runs, so it cannot follow the
 * registry by itself and has to be regenerated when filters are published.
 *
 * Usage:
 *   node scripts/gen-editor-selector.js [options]
 *
 *   --registry <url> registry to read (default: https://registry.bevara.ddns.net)
 *   --list <path>   read a local accessor list instead: a filter_list.json
 *                   (scripts/gen-filter-list.js) or a saved /accessors/index.json
 *   --strict        keep only the patterns backed by a descriptor. By default the
 *                   patterns already in package.json are kept as well, since a
 *                   number of accessors declare no extension yet and are matched
 *                   by the format MediaInfo reports - which a file selector cannot
 *                   see. The report below lists those unbacked patterns.
 *   --dry-run       print the resulting selector instead of writing package.json
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_REGISTRY = 'https://registry.bevara.ddns.net';
const PACKAGE = path.join(REPO_ROOT, 'package.json');
const VIEW_TYPE = 'bevara.pipeline';

function parseArgs(argv) {
	const opts = { registry: DEFAULT_REGISTRY, list: null, strict: false, dryRun: false };
	for (let i = 0; i < argv.length; i++) {
		switch (argv[i]) {
			case '--registry': opts.registry = argv[++i].replace(/\/$/, ''); break;
			case '--list': opts.list = path.resolve(argv[++i]); break;
			case '--strict': opts.strict = true; break;
			case '--dry-run': opts.dryRun = true; break;
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

async function readAccessors() {
	if (opts.list) {
		console.error(`Reading ${path.relative(process.cwd(), opts.list)}`);
		return JSON.parse(fs.readFileSync(opts.list, 'utf8'));
	}
	const url = `${opts.registry}/accessors/index.json`;
	console.error(`Reading ${url}`);
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
	return res.json();
}

const opts = parseArgs(process.argv.slice(2));

(async () => {
	const data = await readAccessors();
	// The registry index lists the accessors under "filters"; filter_list.json is
	// keyed by wasm file.
	const accessors = Array.isArray(data.filters) ? data.filters : Object.values(data);

	// extension -> accessors declaring it, from the descriptors
	const declared = new Map();
	const withoutExtension = [];
	for (const accessor of accessors) {
		const filter = { ...accessor, name: accessor.name.replace(/^bevara:/, '') };
		const extensions = Object.keys(filter.extension || {});
		if (extensions.length === 0) withoutExtension.push(filter.name);
		for (const ext of extensions) {
			const key = ext.toLowerCase().replace(/^\./, '');
			if (!declared.has(key)) declared.set(key, []);
			declared.get(key).push(filter.name);
		}
	}

	const pkg = JSON.parse(fs.readFileSync(PACKAGE, 'utf8'));
	const editor = (pkg.contributes?.customEditors || []).find((e) => e.viewType === VIEW_TYPE);
	if (!editor) {
		console.error(`No custom editor "${VIEW_TYPE}" in package.json`);
		process.exit(1);
	}

	const patternOf = (ext) => `*.${ext}`;
	const extOf = (pattern) => pattern.replace(/^\*\./, '').toLowerCase();

	const existing = editor.selector.map((s) => s.filenamePattern);
	const fromDescriptors = [...declared.keys()].map(patternOf);
	const kept = opts.strict ? [] : existing;
	const patterns = [...new Set([...kept, ...fromDescriptors].map((p) => patternOf(extOf(p))))].sort();

	const added = patterns.filter((p) => !existing.includes(p));
	const removed = existing.filter((p) => !patterns.includes(p));
	const unbacked = patterns.filter((p) => !declared.has(extOf(p)));

	console.error(`${patterns.length} patterns: ${fromDescriptors.length} from ${declared.size} declared extensions` +
		(opts.strict ? '' : `, ${existing.length} already in package.json`));
	if (added.length) console.error(`added (${added.length}): ${added.join(' ')}`);
	if (removed.length) console.error(`removed (${removed.length}): ${removed.join(' ')}`);
	if (unbacked.length) {
		console.error(`\n${unbacked.length} patterns backed by no descriptor - kept from package.json, they match by ` +
			`MediaInfo format in the editor but cannot be derived here:\n  ${unbacked.join(' ')}`);
	}
	if (withoutExtension.length) {
		console.error(`\n${withoutExtension.length} accessors declare no extension at all (add an "extension" map to their ` +
			`descriptor to have them derived):\n  ${withoutExtension.sort().join(', ')}`);
	}

	editor.selector = patterns.map((filenamePattern) => ({ filenamePattern }));

	if (opts.dryRun) {
		process.stdout.write(JSON.stringify(editor.selector, null, '\t') + '\n');
	} else {
		// package.json is tab-indented with a trailing newline; keep it that way.
		fs.writeFileSync(PACKAGE, JSON.stringify(pkg, null, '\t') + '\n');
		console.error(`\nWrote ${patterns.length} patterns to package.json`);
	}
})().catch((error) => {
	console.error(error.message ?? error);
	process.exit(1);
});
