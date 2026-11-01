import * as https from 'https';
import * as crypto from 'crypto';

// Accessors, solvers and universal tags come from the Bevara registry rather
// than from the GitHub releases of each filter repository: one index request
// replaces the two or three API calls per filter that ran into the 60 an hour
// GitHub allows without a token. The sources are still explored on GitHub.
export const REGISTRY = "https://registry.bevara.ddns.net";
/** The solver the editor runs, as pages name it in using="…": its name carries its version. */
export const SOLVER = "mm_solver_1.0.1";

// GitHub repositories whose name differs from the module the registry publishes.
const GITHUB_REPO: { [module: string]: string } = {
	libaiff: "libaif",
};

export function download(url: string, maxRedirects = 5): Promise<Buffer> {
	return new Promise<Buffer>((resolve, reject) => {
		https.get(url, (res) => {
			const status = res.statusCode ?? 0;
			if (status >= 300 && status < 400 && res.headers.location && maxRedirects > 0) {
				res.resume();
				resolve(download(new URL(res.headers.location, url).toString(), maxRedirects - 1));
			} else if (status === 200) {
				const data: Uint8Array[] = [];
				res.on('data', (chunk: Uint8Array) => data.push(chunk));
				res.on('end', () => resolve(Buffer.concat(data)));
				res.on('error', reject);
			} else {
				res.resume();
				reject(new Error(`HTTP ${status} for ${url}`));
			}
		}).on('error', reject);
	});
}

async function getJson(url: string): Promise<any> {
	return JSON.parse((await download(url)).toString('utf8'));
}

/** URL of the latest published file of a module, e.g. mm_solver_1.0.1.js or universal-img_1.js. */
export function accessorUrl(file: string) {
	return `${REGISTRY}/accessors/${encodeURIComponent(file)}`;
}

export async function getIndex() {
	return getJson(`${REGISTRY}/accessors/index.json`);
}

/**
 * Changes whenever a filter or a solver gets a new latest version, which is
 * what the editor compares to offer an update of the accessor list.
 */
export function indexFingerprint(index: any): string {
	const versions = [...index.filters, ...index.runtimes]
		.map((x: any) => `${x.name}@${x.version}`)
		.sort();
	return crypto.createHash('sha256').update(versions.join('\n')).digest('hex');
}

/** Entry of the accessor list, keyed by its wasm file, in the shape the webview reads. */
export function toFilterEntry(version: any) {
	const { signature, wasm, ...manifest } = version;
	const module = version.dist.file.replace(/_\d+\.wasm$/, '');
	const repo = GITHUB_REPO[module] ?? module;
	return {
		...manifest,
		registry: version.name,
		name: version.name.replace(/^bevara:/, ''),
		Format: version.formats,
		owner: "Bevara",
		repo: repo,
		sources: `https://api.github.com/repos/Bevara/${repo}/zipball`,
		imported: false,
		isDev: false
	};
}

/**
 * Builds the accessor list from the latest version of every filter of the
 * registry. Filters that fail are reported, not thrown, so that one broken
 * manifest leaves the rest of the list.
 */
export async function getFilterList(index: any, disabled: string[], onProgress: (counter: number, total: number) => void) {
	const names: string[] = index.filters.map((x: any) => x.name)
		.filter((name: string) => !disabled.includes(name.replace(/^bevara:/, '')));
	const filters: any = {};
	const failures: string[] = [];
	let counter = 0;

	const queue = [...names];
	const worker = async () => {
		for (let name = queue.shift(); name; name = queue.shift()) {
			try {
				const doc = await getJson(`${REGISTRY}/filters/${encodeURIComponent(name)}`);
				const version = doc.versions[doc['dist-tags'].latest];
				filters[version.dist.file] = toFilterEntry(version);
			} catch (error: any) {
				console.error("Error fetching the registry entry of", name, ":", error);
				failures.push(`${name}: ${error?.message ?? error}`);
			}
			onProgress(++counter, names.length);
		}
	};
	await Promise.all(Array.from({ length: 8 }, worker));

	// Answers arrive in any order; the list is shown in the order it is stored.
	const sorted: any = {};
	for (const key of Object.keys(filters).sort()) sorted[key] = filters[key];
	return { filters: sorted, failures };
}
