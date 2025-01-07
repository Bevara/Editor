import * as vscode from 'vscode';
import * as fs from 'fs';
import * as AdmZip from 'adm-zip';
import * as path from 'path';

import { getArtifact, GitHubRepoContext, listArtifacts } from '../git/repository';
import { Credentials } from '../auth/credentials';
import { checkGlobalStorateInitialized } from './utils';
import { BevaraUnpreservedEditorProvider } from '../editors/BevaraUnpreservedEditor';

export function decompressArtifact(buffer: Buffer) {
	const files: { [key: string]: Buffer } = {};
	const zip = new AdmZip(buffer);

	zip.getEntries()
		.sort((a: any, b: any) => a.entryName.localeCompare(b.entryName))
		.forEach((e: any) => {
			files[e.entryName] = e.getData();
		});
	return files;
}

export async function addToLibsActions(context: vscode.ExtensionContext, repoContext: GitHubRepoContext, artifact_id: number) {
	const filter_list: any = context.globalState.get("filterList");


	checkGlobalStorateInitialized(context);
	const artifacts = await listArtifacts(repoContext.client, repoContext.name, repoContext.owner, artifact_id);
	if (artifacts.length != 1) {
		return;
	}
	const buffer = await getArtifact(repoContext.client, repoContext.name, repoContext.owner, artifacts[0].id);
	const files = decompressArtifact(buffer);

	Object.keys(files).filter(x => x.endsWith(".wasm"))
		.forEach((x: string) => {
			const filterName = x.substring(0, x.lastIndexOf(".wasm"));
			const fs_file = vscode.Uri.joinPath(context.globalStorageUri, x).fsPath;
			fs.writeFileSync(fs_file, files[x]);
			if (filterName + ".json" in files) {
				const jsonData = files[filterName + ".json"].toString('utf8');
				const filterDesc = JSON.parse(jsonData);
				filterDesc.isDev = true;
				filterDesc.owner = repoContext.owner;
				filterDesc.repo = repoContext.name;
				filterDesc.source = repoContext.workspaceUri;
				filterDesc.artifact_id = artifact_id;
				filterDesc.internal_id = null;

				filter_list[x] = filterDesc;
			}
		});

	context.globalState.update("filterList", filter_list);
	refreshInterface(filter_list);
}

export function getLastArtifactId(context: vscode.ExtensionContext, repoContext: GitHubRepoContext) {
	const filter_list: any = context.globalState.get("filterList");

	const filter: any = Object.values(filter_list).find((x: any) => x.owner == repoContext.owner && x.repo == repoContext.name && x.isDev == true);

	return filter ? filter.artifact_id : null;
}

export function isArtifactIdInstalled(context: vscode.ExtensionContext, artifact_id: number) {
	const filter_list: any = context.globalState.get("filterList");
	const filter = Object.values(filter_list).find((x: any) => x.artifact_id == artifact_id);

	return filter ? true : false;
}

export function removeArtifactId(context: vscode.ExtensionContext, artifact_id: number) {
	const filter_list: any = context.globalState.get("filterList");
	let filter = null;

	for (const key in filter_list) {
		if (filter_list[key].artifact_id == artifact_id) {
			filter = key;
			break;
		}
	}

	if (filter) {
		deleteLibrary(context, filter);
		delete filter_list[filter];
		context.globalState.update("filterList", filter_list);
		refreshInterface(filter_list);
	}
}

export function getLastInternalId(context: vscode.ExtensionContext, directory: string) {
	if (directory == undefined) return null;

	const filter_list: any = context.globalState.get("filterList");

	const filter: any = Object.values(filter_list).find((x: any) => x.directory == directory && x.isDev == true);

	return filter ? filter.internal_id : null;
}

export async function storeRelease(credentials: Credentials, owner: string, repo: string, asset_id: number, target: string) {
	const response = await credentials.octokit.repos.getReleaseAsset({
		owner: owner,
		repo: repo,
		asset_id: asset_id,
		headers: {
			accept: "application/octet-stream", // GitHub's API requires this header to download binary data
		},
	}
	);
	const wasmData = Buffer.from(response.data as any);
	fs.writeFileSync(target, wasmData);
}

export async function storeLibrary(context: vscode.ExtensionContext, credentials: Credentials, lib: any, target: string) {
	const wasmFilter = lib.id + ".wasm";
	const file = vscode.Uri.joinPath(context.globalStorageUri, wasmFilter).fsPath;
	if (!fs.existsSync(file)) {
		await storeRelease(credentials, lib.owner, lib.repo, lib.binaries, file);
	}
	fs.copyFileSync(file, target + "/" + wasmFilter);
}

export async function deleteLibrary(context: vscode.ExtensionContext, name: any) {
	const file = vscode.Uri.joinPath(context.globalStorageUri, name).fsPath;
	if (fs.existsSync(file)) {
		fs.unlinkSync(file);
	}
}

export async function storeUsing(context: vscode.ExtensionContext, credentials: Credentials, lib: any, target: string) {
	const using = lib.name;
	const file = vscode.Uri.joinPath(context.globalStorageUri, using).fsPath;
	if (!fs.existsSync(file)) {
		await storeRelease(credentials, lib.owner, lib.repo, lib.binaries, file);
	}
	fs.copyFileSync(file, target + "/" + using);
}

export async function storeUniversalTag(context: vscode.ExtensionContext, credentials: Credentials, script_name: string, target: string) {

	const all_releases = await credentials.getAllReleaseTags("Bevara", "player");
	if (all_releases.length == 0) {
		return;
	}

	const asset = all_releases[0].assets.find(x => x.name == script_name);
	if (!asset) {
		return;
	}
	await storeRelease(credentials, "Bevara", "player", asset.id, target + "/" + script_name);
}

export async function getUniversalTag(context: vscode.ExtensionContext, credentials: Credentials, script_name: string) {

	const all_releases = await credentials.getAllReleaseTags("Bevara", "player");
	if (all_releases.length == 0) {
		return;
	}

	const asset = all_releases[0].assets.find(x => x.name == script_name);
	if (!asset) {
		return;
	}
	const response = await credentials.octokit.repos.getReleaseAsset({
		owner: "Bevara",
		repo: "player",
		asset_id: asset.id,
		headers: {
			accept: "application/octet-stream", // GitHub's API requires this header to download binary data
		},
	}
	);
	return Buffer.from(response.data as any);
}


export async function storeHTMLTemplate(html_code: string, input_file: string, script_name: string, target: string) {
	const input_name = path.basename(input_file);

	const html_template = `<!DOCTYPE html>
<html>
<body>
${html_code.replace(input_file, input_name)}

<script src="${script_name}"></script>
</body>
</html>
`;

	fs.writeFileSync(target + "/index.html", html_template);
}

export async function exportHTMLTemplate(context: vscode.ExtensionContext, credentials: Credentials, template: any, target: string) {
	const script_name = template.tag + ".js";

	template.libraries.forEach(async (x: any) => {
		await storeLibrary(context, credentials, x, target);
	});

	template.using.forEach(async (x: any) => {
		await storeUsing(context, credentials, x, target);
	});

	await storeUniversalTag(context, credentials, script_name, target);
	storeHTMLTemplate(template.html_code, template.input_file, script_name, target);



	fs.copyFileSync(template.input_file, target + "/" + path.basename(template.input_file));
}

export async function exportLibs(context: vscode.ExtensionContext, credentials: Credentials, template: any, target: string) {
	const zip = new AdmZip();
	const filesToCompress: string[] = [];
	const script_name = template.tag + ".js";

	template.libraries.forEach(async (x: any) => {
		filesToCompress.push(vscode.Uri.joinPath(context.globalStorageUri, x.id + ".wasm").fsPath);
	});

	template.using.forEach(async (x: any) => {
		filesToCompress.push(vscode.Uri.joinPath(context.globalStorageUri, x.name).fsPath);
	});

	filesToCompress.forEach(file => {
		if (fs.existsSync(file)) {
			zip.addLocalFile(file);
		} else {
			console.log(`File ${file} does not exist`);
		}
	});

	const buffer = await getUniversalTag(context, credentials, script_name);

	if (buffer) {
		zip.addFile(script_name, buffer);
	} else {
		console.log(`File ${script_name} does not exist`);
	}

	zip.writeZip(target);
}


export function addToLibsInternal(context: vscode.ExtensionContext, directory: string, internal_id: string) {
	const filter_list: any = context.globalState.get("filterList");

	checkGlobalStorateInitialized(context);
	const buildPath = path.join(directory, ".bevara", internal_id);

	if (!fs.existsSync(buildPath)) {
		vscode.window.showErrorMessage("The current build doesn't exist in the project.");
		return;
	}

	const items = fs.readdirSync(buildPath);

	for (const item of items) {
		const fullPath = path.join(buildPath, item);
		const stats = fs.statSync(fullPath);
		if (stats.isDirectory()) {
			continue;
		}

		if (item.endsWith(".wasm")) {
			const fs_file = vscode.Uri.joinPath(context.globalStorageUri, item).fsPath;
			fs.copyFileSync(fullPath, fs_file);
		} else if (item.endsWith(".json")) {
			const json_data = fs.readFileSync(fullPath, 'utf-8');
			const filter_desc = JSON.parse(json_data);
			const filterName = item.substring(0, item.lastIndexOf(".json"));
			filter_desc.isDev = true;
			filter_desc.directory = directory;
			filter_desc.internal_id = internal_id;
			filter_list[filterName + ".wasm"] = filter_desc;
		}
	}

	context.globalState.update("filterList", filter_list);
	refreshInterface(filter_list);
}

export function isInternalIdInstalled(context: vscode.ExtensionContext, build: string) {
	const filter_list: any = context.globalState.get("filterList");
	const filter = Object.values(filter_list).find((x: any) => x.build == build);

	return filter ? true : false;
}

export function removeInternalId(context: vscode.ExtensionContext, folder: string) {
	const filter_list: any = context.globalState.get("filterList");
	let filter = null;

	for (const key in filter_list) {
		if (filter_list[key].build == folder) {
			filter = key;
			break;
		}
	}

	if (filter) {
		deleteLibrary(context, filter);
		delete filter_list[filter];
		context.globalState.update("filterList", filter_list);
		refreshInterface(filter_list);
	}
}

function refreshInterface(filter_list: any) {
	function postMessage(panel: vscode.WebviewPanel, type: string, body: any): void {
		panel.webview.postMessage({ type, body });
	}

	for (const webviews of BevaraUnpreservedEditorProvider.webviews.toArray()) {
		postMessage(webviews.webviewPanel, 'refreshList', {
			filter_list: filter_list
		});
	}
}