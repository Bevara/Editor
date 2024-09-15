import * as vscode from 'vscode';
import { UnpreservedDocument } from "../documents/UnpreservedDocument";
import { disposeAll } from '../dispose';
import { getNonce, isDev, accessor_version, getUri } from '../util';
import { WebviewCollection } from '../webviewCollection';
import * as https from 'https';
import * as fs from 'fs';
import { BevaraAuthenticationProvider } from '../auth/authProvider';
import { parse } from 'ini';
import * as path from 'path';
import { Credentials } from '../auth/credentials';
import { GitExtension, API as ScmGitApi } from '../git/vscode.git';

export class BevaraUnpreservedEditorProvider implements vscode.CustomEditorProvider<UnpreservedDocument> {
	private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<UnpreservedDocument>>();
	public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

	private static readonly viewType = 'bevara.pipeline';
	private _requestId = 1;
	private readonly _callbacks = new Map<number, (response: any) => void>();
	private _filter_list :any= {};
	private _credentials = new Credentials();
	private _gitExt: ScmGitApi | undefined = undefined;

	/**
	 * Tracks all known webviews
	 */
	private readonly webviews = new WebviewCollection();

	constructor(
		private readonly _context: vscode.ExtensionContext,
		private readonly _bevaraAuthenticationProvider: BevaraAuthenticationProvider,
	) {
		const filter_list: any = this._context.globalState.get("filterList");

		/*try {
			const json = JSON.stringify(filter_list);
			fs.writeFileSync(this._context.globalStoragePath + "/filterList.json", json, 'utf8');
		} catch (error) {
			console.error("Error fetching or parsing the JSON file:", error);
		}*/

		if (filter_list) {
			this._filter_list = filter_list;
		}

	}

	public static register(context: vscode.ExtensionContext, bevaraAuthenticationProvider: BevaraAuthenticationProvider): vscode.Disposable {

		vscode.commands.registerCommand('bevara.pipeline.new', () => {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders) {
				vscode.window.showErrorMessage("Creating new Bevara Draw files currently requires opening a workspace");
				return;
			}

			const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, `Bevara explorer`)
				.with({ scheme: 'untitled' });


			vscode.commands.executeCommand('vscode.openWith', uri, BevaraUnpreservedEditorProvider.viewType);
		});

		return vscode.window.registerCustomEditorProvider(
			BevaraUnpreservedEditorProvider.viewType,
			new BevaraUnpreservedEditorProvider(context, bevaraAuthenticationProvider),
			{
				// For this demo extension, we enable `retainContextWhenHidden` which keeps the
				// webview alive even when it is not visible. You should avoid using this setting
				// unless is absolutely required as it does have memory overhead.
				webviewOptions: {
					retainContextWhenHidden: true,
				},
				supportsMultipleEditorsPerDocument: false,
			});
	}

	saveCustomDocument(document: UnpreservedDocument, cancellation: vscode.CancellationToken): Thenable<void> {
		return document.save(cancellation);
	}
	saveCustomDocumentAs(document: UnpreservedDocument, destination: vscode.Uri, cancellation: vscode.CancellationToken): Thenable<void> {
		return document.saveAs(destination, cancellation);
	}
	revertCustomDocument(document: UnpreservedDocument, cancellation: vscode.CancellationToken): Thenable<void> {
		throw new Error('Method not implemented.');
	}
	backupCustomDocument(document: UnpreservedDocument, context: vscode.CustomDocumentBackupContext, cancellation: vscode.CancellationToken): Thenable<vscode.CustomDocumentBackup> {
		throw new Error('Method not implemented.');
	}
	async openCustomDocument(uri: vscode.Uri, openContext: vscode.CustomDocumentOpenContext, token: vscode.CancellationToken):
		Promise<UnpreservedDocument> {
		const document: UnpreservedDocument = await UnpreservedDocument.create(uri, openContext.backupId, {
			getFileData: async () => {
				const webviewsForDocument = Array.from(this.webviews.get(document.uri));
				if (!webviewsForDocument.length) {
					throw new Error('Could not find webview to save for');
				}
				const panel = webviewsForDocument[0];
				return await this.postMessageWithResponse<number[]>(panel, 'getFileData', {});
			}
		});

		const listeners: vscode.Disposable[] = [];

		listeners.push(document.onDidChange(e => {
			// Tell VS Code that the document has been edited by the use.
			this._onDidChangeCustomDocument.fire({
				document,
				...e,
			});
		}));

		listeners.push(document.onDidChangeContent(e => {
			// Update all webviews when the document changes
			for (const webviewPanel of this.webviews.get(document.uri)) {
				this.postMessage(webviewPanel, 'update', {
					edits: e.edits,
					content: e.content,
				});
			}
		}));

		document.onDidDispose(() => disposeAll(listeners));

		return document;
	}

	private postMessageWithResponse<R = unknown>(panel: vscode.WebviewPanel, type: string, body: any): Promise<R> {
		const requestId = this._requestId++;
		const p = new Promise<R>(resolve => this._callbacks.set(requestId, resolve));
		panel.webview.postMessage({ type, requestId, body });
		return p;
	}

	private postMessage(panel: vscode.WebviewPanel, type: string, body: any): void {
		panel.webview.postMessage({ type, body });
	}

	private onMessage(document: UnpreservedDocument, message: any) {
		switch (message.type) {
			case 'response':
				{
					const callback = this._callbacks.get(message.requestId);
					callback?.(message.body);
					return;
				}
		}
	}

	async getDescFromRepo(owner: string, repo: string, branch?: string) {
		const response = await this._credentials.octokit.repos.getContent({
			owner: owner,
			repo: repo,
			path: repo + ".json",
			ref: branch, // Optional, default is the repository’s default branch (usually main)
		});

		// The content is base64 encoded, so you need to decode it
		const content = Buffer.from((response.data as any).content, 'base64').toString('utf8');

		// Parse the content as JSON
		return JSON.parse(content);
	}

	async getAllReleaseTags(owner: string, repo: string) {
		const releasesResponse = await this._credentials.octokit.repos.listReleases({
			owner: owner,
			repo: repo
		});

		return releasesResponse.data;
	}

	async parseReleaseAssets(owner: string, repo: string, data: any, imported:boolean) {
		const source = data.zipball_url;
		const binaries = data.assets.filter((x: any) => x.content_type == 'application/wasm');
		const descs = data.assets.filter((x: any) => x.content_type == 'application/json');
		const filters: any = {};
		for (const binary of binaries) {
			const name = path.parse(binary.name).name;
			const desc = descs.find((x: any) => path.parse(x.name).name == name);
			const filter_desc = await this._credentials.octokit.repos.getReleaseAsset({
				owner: owner,
				repo: repo,
				asset_id: desc.id,
				headers: {
					accept: "application/octet-stream", // GitHub's API requires this header to download binary data
				},
			}
			);

			const content = Buffer.from((filter_desc.data as any), 'base64').toString('utf8');
			const jsonData = JSON.parse(content);
			jsonData.sources = source;
			jsonData.binaries = binary.id;
			jsonData.owner = owner;
			jsonData.repo = repo;
			jsonData.imported = imported;
			filters[binary.name] = jsonData;
		}
		return filters;

	}

	async initFiltersList(webviewPanel: vscode.WebviewPanel) {
		const lastCommitHash = await this.getLastCommitHash("Bevara", "filters");
		this._context.globalState.update("filterListHash", lastCommitHash);
		// Fetch the .gitmodules file
		const response = await this._credentials.octokit.repos.getContent({
			owner: "Bevara",
			repo: "filters",
			path: ".gitmodules",
			ref: "master", // Optional, default is the repository’s default branch (usually main)
		});

		// The content is base64 encoded, so you need to decode it
		const content = Buffer.from((response.data as any).content, 'base64').toString('utf8');

		// Parse the content as an INI file
		const submodules = parse(content);
		let filters: any = {};
		const total = Object.keys(submodules).length;
		let counter = 0;
		for (const key in submodules) {
			const submodule = submodules[key];
			if (submodule.path == "third_parties") continue;
			const end_url = submodule.url.replace("https://github.com/", "");
			const owner = end_url.split("/")[0];
			const repo = end_url.split("/")[1].replace(".git", "");
			try {
				const all_releases = await this.getAllReleaseTags(owner, repo);
				if (all_releases.length > 0) {
					const assests = await this.parseReleaseAssets(owner, repo, all_releases[0], false);
					filters = Object.assign({}, filters, assests);
				}
			} catch (error) {
				console.error("Error fetching or parsing the JSON from repository ", repo, "from owner ", owner, " : ", error);
			}
			counter++;
			this.postMessage(webviewPanel, 'updatingList', {
				counter: counter,
				total: total
			});
		}

		this._context.globalState.update("filterList", filters);
		return filters;
	}

	async getLastCommitHash(owner: string, repo: string) {
		try {
			const { data } = await this._credentials.octokit.repos.listCommits({
				owner: owner,
				repo: repo,
				per_page: 1,
			});

			const lastCommitHash = data[0].sha;
			console.log(`Last commit hash: ${lastCommitHash}`);

			return lastCommitHash;
		} catch (error) {
			console.error('Error fetching the last commit:', error);
		}
	}

	async forkGenericFilter(name: string, owner: string, repo: string) {
		try {
			const response = await this._credentials.octokit.repos.createFork({
				owner: owner,  // Replace with the owner of the repository you want to fork
				repo: repo,           // Replace with the repository name you want to fork
				name: name
			});

			
			console.log('Repository forked successfully:', response.data);

			const new_owner = response.data.owner.login;
			await this._credentials.octokit.request('PUT /repos/{owner}/{repo}/actions/permissions', {
				owner : new_owner,
				repo: name,
				enabled: true
			});

			console.log(`GitHub Actions enabled for ${owner}/${repo}`);

			return response.data;
		} catch (error) {
			console.error('Error forking the repository:', error);
			return null;
		}
	}

	async cloneGenericFilter(repository: any) {

		if (this._gitExt == undefined || repository == null) {
			return;
		}
		try {

			const destinationUri = await vscode.window.showOpenDialog({
				canSelectFolders: true,
				canSelectFiles: false,
				canSelectMany: false,
				openLabel: 'Select a folder to store locally the filter sources',
			});

			if (!destinationUri || destinationUri.length === 0) {
				vscode.window.showErrorMessage('No folder selected');
				return;
			}

			const localPath = destinationUri[0].fsPath;
			await vscode.commands.executeCommand('git.clone', repository.clone_url, localPath);

			console.log(`Repository cloned to ${localPath}`);
			return localPath;
		} catch (error: any) {
			console.error('Error cloning the repository:', error.message);
		}
	}

	async downloadWasms(webview: vscode.Webview, ids: string[]) {
		// Assurez-vous que le répertoire existe
		if (!fs.existsSync(this._context.globalStoragePath)) {
			fs.mkdirSync(this._context.globalStoragePath, { recursive: true });
		}

		function fetchWasm(file: string, url: string, maxRedirects = 5) {
			return new Promise<Buffer>((resolve, reject) => {
				https.get(url, async (res) => {
					if (res.statusCode == 302 && res.headers.location && maxRedirects > 0) {
						const redirectUrl = new URL(res.headers.location, url).toString();
						resolve(await fetchWasm(file, redirectUrl, maxRedirects - 1));
					} else if (res.statusCode === 200) {
						const data: Uint8Array[] = [];
						res.on('data', (chunk: Uint8Array) => data.push(chunk));
						res.on('end', () => {
							const buffer = Buffer.concat(data);

							if (vscode.workspace.workspaceFolders) {
								fs.writeFileSync(file, buffer);
							}
							resolve(buffer);
						});
					} if (res.statusCode !== 200) {
						reject(`Failed to fetch file. Status code: ${res.statusCode}`);
					}
				});
			});
		}

		async function checkSolver(storageUri: vscode.Uri, file: string) {
			const release = "https://github.com/Bevara/solver/releases/download/1/" + file;
			const uri = vscode.Uri.joinPath(storageUri, file).fsPath;
			if (!fs.existsSync(file)) {
				await fetchWasm(uri, release);
			}
		}

		await checkSolver(this._context.globalStorageUri, "solver_1.js");
		await checkSolver(this._context.globalStorageUri, "solver_1.wasm");

		const wasms: any = {};

		for (let id of ids) {
			const wasmFilter = id + ".wasm";
			if (wasmFilter in this._filter_list) {
				const filter = (this._filter_list as any)[wasmFilter];
				const file = vscode.Uri.joinPath(this._context.globalStorageUri, wasmFilter).fsPath;
				if (!fs.existsSync(file)) {
					const response = await this._credentials.octokit.repos.getReleaseAsset({
						owner: filter.owner,
						repo: filter.repo,
						asset_id: filter.binaries,
						headers: {
							accept: "application/octet-stream", // GitHub's API requires this header to download binary data
						},
					}
					);
					if (vscode.workspace.workspaceFolders) {
						const wasmData = Buffer.from(response.data as any);
						fs.writeFileSync(file, wasmData);
					}
				}
				wasms[id] = webview.asWebviewUri(vscode.Uri.file(file)).toString();
			}
		}

		return wasms;
	}

	async getBuiltInGitApi(): Promise<ScmGitApi | undefined> {
		try {
			const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
			if (extension == null) return undefined;

			const gitExtension = extension.isActive ? extension.exports : await extension.activate();
			return gitExtension?.getAPI(1);
		} catch {
			return undefined;
		}
	}

	async resolveCustomEditor(document: UnpreservedDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken): Promise<void> {
		const scriptDirectoryUri = getUri(webviewPanel.webview, this._context.globalStorageUri, ["/"]);

		// Add the webview to our internal set of active webviews
		this.webviews.add(document.uri, webviewPanel);

		// Setup initial content for the webview
		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				this._context.extensionUri,
				this._context.globalStorageUri
			]
		};

		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);
		webviewPanel.webview.onDidReceiveMessage(e => this.onMessage(document, e));

		this._bevaraAuthenticationProvider.onDidChangeSessions(async (e) => {
			const sessions = await this._bevaraAuthenticationProvider.getSessions();
			if (sessions.length > 0) {
				const accessToken = sessions[0].accessToken;
				const info = await this._bevaraAuthenticationProvider.info(accessToken);
				this.postMessage(webviewPanel, 'updateProfile', {
					account: info
				});
			} else {
				this.postMessage(webviewPanel, 'updateProfile', {
					logout: true
				});
			}
		});

		// Get github credentials
		this._credentials.initialize(this._context)
			.then(async isAuthentificated => {
				if (isAuthentificated) {
					const octokit = await this._credentials.login();
					const userInfo = await octokit.users.getAuthenticated();
					this.postMessage(webviewPanel, 'updateProfile', {
						github: userInfo.data
					});
				}
			});

		// Get git extension
		this.getBuiltInGitApi().then((extension) => {
			if (extension != undefined) {
				this._gitExt = extension;
				this.postMessage(webviewPanel, 'updateProfile', {
					hasGit: true
				});
			}
		});

		// Wait for the webview to be properly ready before we init
		webviewPanel.webview.onDidReceiveMessage(async e => {
			if (e.type === 'ready') {
				// Check user authentification to Bevara
				vscode.authentication.getSession(BevaraAuthenticationProvider.id, [], { createIfNone: false })
					.then(async (session) => {
						if (session) {
							const info = await this._bevaraAuthenticationProvider.info(session.accessToken);
							this.postMessage(webviewPanel, 'updateProfile', {
								account: info
							});
						}
					});

				//this._filter_list = await this.initFiltersList(webviewPanel); // Force update

				// Check if filterlist has to be initialized or updates
				const filterListHash = this._context.globalState.get("filterListHash");
				const lastCommitHash = await this.getLastCommitHash("Bevara", "filters");
				if (!filterListHash) {
					try {
						this._filter_list = await this.initFiltersList(webviewPanel);
						this.postMessage(webviewPanel, 'updatingList', {
							end: true
						});
					} catch (error) {
						console.error("Error innitializing filter list :", error);
						this.postMessage(webviewPanel, 'updatingList', {
							end: true
						});
					}
				} else if (filterListHash != lastCommitHash) {
					this.postMessage(webviewPanel, 'UpdateAvailable', {
					});
				}

				if (document.uri.scheme === 'untitled') {
					this.postMessage(webviewPanel, 'init', {
						untitled: true,
					});
				} else {
					this.postMessage(webviewPanel, 'init', {
						uri: document.uri,
						value: document.documentData,
						scriptsDirectory: `${scriptDirectoryUri}`,
						filter_list: this._filter_list,
						scripts: {
							"image": isDev ? webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(
								this._context.extensionUri, 'player', 'build', 'dist', 'universal-img.js')) : "https://bevara.ddns.net/accessors-build/accessors-" + accessor_version + "/universal-img.js",
							"audio": isDev ? webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(
								this._context.extensionUri, 'player', 'build', 'dist', 'universal-audio.js')) : "https://bevara.ddns.net/accessors-build/accessors-" + accessor_version + "/universal-audio.js",
							"video": isDev ? webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(
								this._context.extensionUri, 'player', 'build', 'dist', 'universal-video.js')) : "https://bevara.ddns.net/accessors-build/accessors-" + accessor_version + "/universal-video.js",
							"canvas": isDev ? webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(
								this._context.extensionUri, 'player', 'build', 'dist', 'universal-canvas.js')) : "https://bevara.ddns.net/accessors-build/accessors-" + accessor_version + "/universal-canvas.js",
							"artplayer": isDev ? webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(
								this._context.extensionUri, 'player', 'build', 'dist', 'artplayer.js')) : "https://bevara.ddns.net/accessors-build/accessors-" + accessor_version + "/artplayer.js"
						}
					});
				}
			} else if (e.type === 'save') {
				document.preserve();
			} else if (e.type === 'open_link') {
				vscode.env.openExternal(vscode.Uri.parse(e.url));
			} else if (e.type === 'explore') {
				vscode.commands.executeCommand('bevexplorer.exploreBevFile', e.url, e.filter);
			}
			else if (e.type === 'getWasms') {

				this.downloadWasms(webviewPanel.webview, e.libs)
					.then((wasms) => {
						this.postMessage(webviewPanel, 'wasmReady', {
							wasms: wasms
						});
					});
			} else if (e.type === 'inject') {
				console.log(e.html);
			} else if (e.type === 'login') {
				vscode.authentication.getSession(BevaraAuthenticationProvider.id, [], { createIfNone: true });
			}
			else if (e.type === 'switchUser') {
				vscode.authentication.getSession(BevaraAuthenticationProvider.id, [], { forceNewSession: true });
			} else if (e.type === 'logout') {
				this._bevaraAuthenticationProvider.removeSession("");
			} else if (e.type === 'addAccessor') {
				try {
					const assests = await this.parseReleaseAssets(e.owner, e.repo, e.release, true);
					this._filter_list = Object.assign({}, this._filter_list, assests);
					this._context.globalState.update("filterList", this._filter_list);
					this.postMessage(webviewPanel, 'newAccessor', {
						status: "OK",
						filter_list: this._filter_list
					});
				} catch (error: any) {
					console.error("Error innitializing filter list :", error);
					this.postMessage(webviewPanel, 'newAccessor', {
						status: error.message
					});
				}
			} else if (e.type === 'updateList') {
				try {
					this._filter_list = await this.initFiltersList(webviewPanel);
					this.postMessage(webviewPanel, 'updatingList', {
						end: true
					});
				} catch (error) {
					console.error("Error innitializing filter list :", error);
					this.postMessage(webviewPanel, 'updatingList', {
						end: true
					});
				}
			}else if (e.type === 'removeFromList') {
				for (const keys in this._filter_list){
					const filter_desc = this._filter_list[keys];
					if (filter_desc.name == e.filter){
						delete this._filter_list[keys];
					}
				}

				this._context.globalState.update("filterList", this._filter_list);
				this.postMessage(webviewPanel, 'refreshList', {
					filter_list: this._filter_list
				});
			} else if (e.type === 'getReleases') {
				try {
					const releases = await this.getAllReleaseTags(e.owner, e.repo);
					this.postMessage(webviewPanel, 'releaseList', {
						releases: releases
					});
				} catch (error) {
					console.error("Error innitializing filter list :", error);
					this.postMessage(webviewPanel, 'releaseList', {
						error: error
					});
				}
			} else if (e.type === 'loginToGithub') {
				const octokit = await this._credentials.login();
				const userInfo = await octokit.users.getAuthenticated();
				vscode.window.showInformationMessage(`Logged into GitHub as ${userInfo.data.login}`);
			} else if (e.type === 'createAccessor') {
				const repository = await this.forkGenericFilter(e.name, e.owner, e.repo);
				await this.cloneGenericFilter(repository);
			} else if (e.type === 'openExtension') {
				vscode.commands.executeCommand('extension.open', e.name);
			}
		});
	}

	/**
	 * Defines and returns the HTML that should be rendered within the webview panel.
	 *
	 * @remarks This is also the place where references to the Angular webview build files
	 * are created and inserted into the webview HTML.
	 *
	 * @param webview A reference to the extension webview
	 * @param extensionUri The URI of the directory containing the extension
	 * @returns A template string literal containing the HTML that should be
	 * rendered within the webview panel
	 */
	private getHtmlForWebview(webview: vscode.Webview): string {
		// The CSS file from the Angular build output
		const stylesUri = getUri(webview, this._context.extensionUri, ["Interface", "build", "styles.css"]);
		// The JS files from the Angular build output
		const runtimeUri = getUri(webview, this._context.extensionUri, ["Interface", "build", "runtime.js"]);
		const polyfillsUri = getUri(webview, this._context.extensionUri, ["Interface", "build", "polyfills.js"]);
		const mainUri = getUri(webview, this._context.extensionUri, ["Interface", "build", "main.js"]);
		const scripstUri = getUri(webview, this._context.extensionUri, ["Interface", "build", "scripts.js"]);
		const solverUri = getUri(webview, this._context.globalStorageUri, ["solver_1.js"]);
		const testUri = getUri(webview, this._context.globalStorageUri, ["test.js"]);
		const universalUri = getUri(webview, this._context.extensionUri, ["Interface", "player", "dist", "universal-tags_1.js"]);

		const nonce = getNonce();

		// Tip: Install the es6-string-html VS Code extension to enable code highlighting below
		return /*html*/ `
		  <!DOCTYPE html>
		  <html lang="en">
			<head>
			  <meta charset="UTF-8" />
			  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
			  <link rel="preconnect" href="https://fonts.gstatic.com">
			  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500&display=swap" rel="stylesheet">
			  <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
			  <base href="/">  
			  <link rel="stylesheet" type="text/css" href="${stylesUri}">
			  <title>Bevara - future-proof your data</title>
			</head>
			<body class="mat-typography mat-app-background">
			<app-root></app-root>
			<script type="module" nonce="${nonce}" src="${runtimeUri}"></script>
			<script type="module" nonce="${nonce}" src="${polyfillsUri}"></script>
			<script type="module" nonce="${nonce}" src="${mainUri}"></script>
			<script type="module" nonce="${nonce}" src="${scripstUri}"></script>
			</body>
		  </html>
		`;
	}
}