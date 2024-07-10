import * as vscode from 'vscode';
import { UnpreservedDocument } from "../documents/UnpreservedDocument";
import { disposeAll } from '../dispose';
import { getNonce, isDev, accessor_version, getUri } from '../util';
import { WebviewCollection } from '../webviewCollection';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as filter_list from './filter_list.json';
import { buffer } from 'stream/consumers';
import { Session } from 'inspector';
import { BevaraAuthenticationProvider } from '../auth/authProvider';


export class BevaraUnpreservedEditorProvider implements vscode.CustomEditorProvider<UnpreservedDocument> {
	private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<UnpreservedDocument>>();
	public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

	private static readonly viewType = 'bevara.pipeline';
	private static newBevaraDrawFileId = 1;
	private _requestId = 1;
	private readonly _callbacks = new Map<number, (response: any) => void>();
	private _filter_list = filter_list;

	/**
	 * Tracks all known webviews
	 */
	private readonly webviews = new WebviewCollection();

	constructor(
		private readonly _context: vscode.ExtensionContext
	) {


	}

	public static register(context: vscode.ExtensionContext): vscode.Disposable {
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
			new BevaraUnpreservedEditorProvider(context),
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
			if (wasmFilter in filter_list) {
				const filter = (filter_list as any)[wasmFilter];
				const file = vscode.Uri.joinPath(this._context.globalStorageUri, wasmFilter).fsPath;
				let buffer = null;
				if (!fs.existsSync(file)) {
					buffer = await fetchWasm(file, filter.binaries);
				}
				wasms[id] = webview.asWebviewUri(vscode.Uri.file(file)).toString();
			}
		}

		return wasms;
	}

	async login(){
		const session = await vscode.authentication.getSession(BevaraAuthenticationProvider.id, [], { createIfNone: true });

		try {
			https.get("https://wwww.example.com", async (res) => {
				vscode.window.showInformationMessage('OK!');
			});
		} catch (e: any) {
			if (e.message === 'Unauthorized') {
				vscode.window.showErrorMessage('Failed to get profile. You need to use a PAT that has access to all organizations. Please sign out and try again.');
			}
			throw e;
		}
	}

	resolveCustomEditor(document: UnpreservedDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken): void | Thenable<void> {
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

		// Wait for the webview to be properly ready before we init
		webviewPanel.webview.onDidReceiveMessage(e => {
			if (e.type === 'ready') {

				if (document.uri.scheme === 'untitled') {
					this.postMessage(webviewPanel, 'init', {
						untitled: true
					});
				} else {
					this.postMessage(webviewPanel, 'init', {
						uri: document.uri,
						value: document.documentData,
						scriptsDirectory: `${scriptDirectoryUri}`,
						filter_list: filter_list,
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
				this.login();
			} else if (e.type === 'getToken') {
				console.log('getToken :' + e.token);
			} else if (e.type === 'setToken') {
				console.log('setToken :' + e.token);
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