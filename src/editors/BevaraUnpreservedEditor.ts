import * as vscode from 'vscode';
import * as fs from 'fs';

import { UnpreservedDocument } from "../documents/UnpreservedDocument";
import { disposeAll } from '../dispose';
import { getNonce, isDev, accessor_version, getUri } from '../util';
import { WebviewCollection } from '../webviewCollection';
import { BevaraAuthenticationProvider } from '../auth/authProvider';
import { parse } from 'ini';
import { Credentials } from '../auth/credentials';
import { deleteLibrary, exportHTMLTemplate, exportLibs, storeAccessor } from '../filters/libraries';
import { accessorUrl, download, getFilterList, getIndex, indexFingerprint } from '../filters/registry';

// Filters left out of the list built from the registry. ffdmx advertises
// fourteen container and codec formats, so it was recommended for nearly every
// input, and it imports libavdevice and libavfilter symbols that no module
// provides, so it throws from its own init as soon as it is loaded.
const DISABLED_FILTERS = ['ffdmx'];


export class BevaraUnpreservedEditorProvider implements vscode.CustomEditorProvider<UnpreservedDocument> {
	private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<UnpreservedDocument>>();
	public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

	private static readonly viewType = 'bevara.pipeline';
	private _requestId = 1;
	private readonly _callbacks = new Map<number, (response: any) => void>();
	private _filter_list: any = {};
	private _credentials = new Credentials();

	/**
	 * Tracks all known webviews
	 */
	static readonly webviews = new WebviewCollection();

	constructor(
		private readonly _context: vscode.ExtensionContext,
		private readonly _bevaraAuthenticationProvider: BevaraAuthenticationProvider,
	) {
		

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
				const webviewsForDocument = Array.from(BevaraUnpreservedEditorProvider.webviews.get(document.uri));
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
			for (const webviewPanel of BevaraUnpreservedEditorProvider.webviews.get(document.uri)) {
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

	async initFiltersList(webviewPanel: vscode.WebviewPanel) {
		const index = await getIndex();
		const fingerprint = indexFingerprint(index);
		const { filters, failures } = await getFilterList(index, DISABLED_FILTERS, (counter, total) => {
			this.postMessage(webviewPanel, 'updatingList', {
				counter: counter,
				total: total
			});
		});

		// Accessors and the solver are only downloaded when missing from the
		// storage, so a cached copy of an older version - or of a GitHub release,
		// before the list came from the registry - would otherwise be kept for
		// good, and accessors built with a newer toolchain then fail to link
		// against an older solver. A rebuilt list drops what may be stale.
		for (const file in filters) {
			if (this._filter_list?.[file]?.version !== filters[file].version) {
				deleteLibrary(this._context, file);
			}
		}
		for (const file of ["solver_1.js", "solver_1.wasm"]) {
			deleteLibrary(this._context, file);
		}

		// What happened is reported here rather than left in the console: a list
		// that came back empty or short used to look like nothing had run at all.
		const count = Object.keys(filters).length;
		if (failures.length > 0) {
			const reason = failures[0];
			const rest = failures.length > 1 ? ` (and ${failures.length - 1} more)` : "";
			(count === 0 ? vscode.window.showErrorMessage : vscode.window.showWarningMessage)(
				`Bevara: ${count} accessor${count === 1 ? "" : "s"} loaded, ${failures.length} failed - ${reason}${rest}`);
		} else {
			vscode.window.showInformationMessage(`Bevara: ${count} accessors loaded from the registry.`);
		}

		this._context.globalState.update("filterList", filters);
		// The fingerprint is stored only once the list is actually built: a run
		// that failed or was closed midway must not look up to date.
		this._context.globalState.update("filterListHash", fingerprint);
		return filters;
	}

	async downloadWasms(webview: vscode.Webview, ids: string[]) {
		// Assurez-vous que le répertoire existe
		if (!fs.existsSync(this._context.globalStoragePath)) {
			fs.mkdirSync(this._context.globalStoragePath, { recursive: true });
		}

		/*if (!checkSolver(this._context.globalStorageUri)){
			await downloadSolver(this._context, this._credentials);
		}*/

		async function checkSolver(storageUri: vscode.Uri, file: string) {
			const uri = vscode.Uri.joinPath(storageUri, file).fsPath;
			if (!fs.existsSync(uri)) {
				fs.writeFileSync(uri, await download(accessorUrl(file)));
			}
		}

		await checkSolver(this._context.globalStorageUri, "solver_1.js");
		await checkSolver(this._context.globalStorageUri, "solver_1.wasm");
		const wasms: any = {};

		for (const id of ids) {
			try {
				const wasmFilter = id + ".wasm";
				if (wasmFilter in this._filter_list) {
					const filter = (this._filter_list as any)[wasmFilter];
					const file = vscode.Uri.joinPath(this._context.globalStorageUri, wasmFilter).fsPath;
					if (!fs.existsSync(file)) {
						await storeAccessor(this._credentials, filter, file);
					}
					wasms[id] = webview.asWebviewUri(vscode.Uri.file(file)).toString();
				}
			}catch(e){
				continue;
			}
			
		}

		return wasms;
	}

	async resolveCustomEditor(document: UnpreservedDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken): Promise<void> {
		const scriptDirectoryUri = getUri(webviewPanel.webview, this._context.globalStorageUri, ["/"]);

		// Add the webview to our internal set of active webviews
		BevaraUnpreservedEditorProvider.webviews.add(document.uri, webviewPanel);

		// Setup initial content for the webview
		const localResourceRoots = [
			this._context.extensionUri,
			this._context.globalStorageUri
		];
		// The document is handed to the pipeline as a webview resource URL, so
		// its folder has to be servable. GPAC opens the source itself and only
		// knows http(s): the blob: URL the webview used to build from the bytes
		// was refused ("Requested URL is not valid or cannot be found").
		if (document.uri.scheme !== 'untitled') {
			localResourceRoots.push(vscode.Uri.joinPath(document.uri, '..'));
		}
		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots
		};

		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);
		webviewPanel.webview.onDidReceiveMessage(e => this.onMessage(document, e));


		// Wait for the webview to be properly ready before we init
		webviewPanel.webview.onDidReceiveMessage(async e => {
			if (e.type === 'ready') {
				// Get all credentials
				try{
					await this._credentials.initialize(this._context, this._bevaraAuthenticationProvider);
					this._credentials.addWebView(webviewPanel.webview);
					this._credentials.updateInterface();
				}catch (e :any){
					vscode.window.showInformationMessage(`Logging failed for the following reason ${e.message}`);
				}
				

				const filter_list: any = this._context.globalState.get("filterList");

				if (filter_list) {
					this._filter_list = filter_list;
				}
				
				//this._filter_list = await this.initFiltersList(webviewPanel); // Force update

				// Check if filterlist has to be initialized or updates
				const filterListHash = this._context.globalState.get("filterListHash");
				let registryHash: string | undefined;
				try {
					registryHash = indexFingerprint(await getIndex());
				} catch (error) {
					console.error("Error reaching the registry :", error);
				}
				// An empty list is rebuilt whatever the stored hash says, so a run
				// that stored a hash without producing a list recovers on its own.
				const hasFilters = this._filter_list && Object.keys(this._filter_list).length > 0;
				if (!filterListHash || !hasFilters) {
					try {
						this._filter_list = await this.initFiltersList(webviewPanel);
						this.postMessage(webviewPanel, 'updatingList', {
							end: true
						});
					} catch (error: any) {
						console.error("Error innitializing filter list :", error);
						vscode.window.showErrorMessage(`Bevara: could not build the accessor list - ${error?.message ?? error}`);
						this.postMessage(webviewPanel, 'updatingList', {
							end: true
						});
					}
				} else if (registryHash && filterListHash != registryHash) {
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
						// An https URL GPAC can open, in place of a blob: built from value.
						fileUrl: webviewPanel.webview.asWebviewUri(document.uri).toString(),
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
				vscode.authentication.getSession(BevaraAuthenticationProvider.id, [], { forceNewSession: true });
			}
			else if (e.type === 'switchUser') {
				vscode.authentication.getSession(BevaraAuthenticationProvider.id, [], { forceNewSession: true });
			} else if (e.type === 'logout') {
				this._bevaraAuthenticationProvider.removeSession("");
			} else if (e.type === 'addAccessor') {
				try {
					const assests = await this._credentials.parseReleaseAssets(e.owner, e.repo, e.release, true);
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
					// The other handlers hand the rebuilt list back to the webview;
					// without this one the modal closed on a list that never changed.
					this.postMessage(webviewPanel, 'refreshList', {
						filter_list: this._filter_list
					});
				} catch (error: any) {
					console.error("Error innitializing filter list :", error);
					vscode.window.showErrorMessage(`Bevara: could not refresh the accessor list - ${error?.message ?? error}`);
					this.postMessage(webviewPanel, 'updatingList', {
						end: true
					});
				}
			} else if (e.type === 'removeFromList') {
				const key = e.filter + ".wasm";
				if (key in this._filter_list ){
					deleteLibrary(this._context, key);
					delete this._filter_list[key];
				}

				this._context.globalState.update("filterList", this._filter_list);
				this.postMessage(webviewPanel, 'refreshList', {
					filter_list: this._filter_list
				});
			} else if (e.type === 'getReleases') {
				try {
					const releases = await this._credentials.getAllReleaseTags(e.owner, e.repo);
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
				const octokit = await this._credentials.loginToGithub();
				const userInfo = await octokit.users.getAuthenticated();
				vscode.window.showInformationMessage(`Logged into GitHub as ${userInfo.data.login}`);
			} else if (e.type === 'createAccessor') {

				// if (e.owner == "Bevara" && e.repo == "base_filter"){
				// 	const repository = await this._credentials.createRepo(e.name, "");
				// 	const localPath = await this._credentials.cloneRepository(repository.git_url);
				// 	const downloadUrl = this._credentials.downloadRepoArchive(e.owner, e.repo, "main");


				// }else {
				const repository = await this._credentials.forkExistingFilter(e.name, e.owner, e.repo);
				await this._credentials.cloneRepository(repository);
				//}
			} else if (e.type === 'openExtension') {
				vscode.commands.executeCommand('extension.open', e.name);
			} else if (e.type === 'checkIfRepoExists') {
				const repoExist = await this._credentials.checkIfRepoExists(e.owner, e.repo);

				this.postMessage(webviewPanel, 'repoExist', {
					repoExist: repoExist,
					isTemplate: e.isTemplate
				});
			} else if (e.type === 'checkIfForkExists') {
				const forkExist = await this._credentials.checkIfForkExists(e.owner, e.repo, e.username);

				this.postMessage(webviewPanel, 'forkExist', {
					forkExist: forkExist
				});
			} else if (e.type === 'download_zip') {
				
				const saveUri = await vscode.window.showSaveDialog({
					filters: { 'ZIP Files': ['zip'] }, // Only allow .zip files to be saved
					saveLabel: 'Save ZIP File'
				});

				if (!saveUri) {
					// User cancelled the dialog
					return;
				}
				
				await exportLibs(this._context, this._credentials, e, saveUri.fsPath);

			}else if (e.type === 'export_html') {
				

				const folderUri = await vscode.window.showOpenDialog({
					canSelectFolders: true,
					canSelectMany: false,
					openLabel: 'Select Folder to Save Files'
				});

				if (!folderUri || folderUri.length === 0) {
					vscode.window.showErrorMessage('No folder selected.');
					return;
				}

				await exportHTMLTemplate(this._context, this._credentials, e, folderUri[0].fsPath);
				
				const openFolderResponse = await vscode.window.showInformationMessage(
					'Do you want to open the folder?',
					'Open Folder'
				);

				if (openFolderResponse === 'Open Folder') {
					// Open the folder in the system's default file explorer
					vscode.commands.executeCommand('vscode.openFolder', folderUri[0]);
				}
				
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