import * as vscode from 'vscode';
import { UnpreservedDocument } from "../documents/UnpreservedDocument";
import { disposeAll } from '../dispose';
import { getNonce, isDev, accessor_version } from '../util';
import { WebviewCollection } from '../webviewCollection';

export class BevaraUnpreservedEditorProvider implements vscode.CustomEditorProvider<UnpreservedDocument> {
	private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<UnpreservedDocument>>();
	public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

	private static readonly viewType = 'bevara.pipeline';
	private static newBevaraDrawFileId = 1;
	private _requestId = 1;
	private readonly _callbacks = new Map<number, (response: any) => void>();

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

			const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, `new-${BevaraUnpreservedEditorProvider.newBevaraDrawFileId++}.bvr`)
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


	resolveCustomEditor(document: UnpreservedDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken): void | Thenable<void> {
		// Add the webview to our internal set of active webviews
		this.webviews.add(document.uri, webviewPanel);

		// Setup initial content for the webview
		webviewPanel.webview.options = {
			enableScripts: true,
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
						scripts : {
							"image" : isDev ? webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(
								this._context.extensionUri, 'player', 'build', 'dist', 'universal-img.js')) : "http://bevara.ddns.net/accessors-build/accessors-"+accessor_version+"/universal-img.js",
							"audio":isDev ? webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(
								this._context.extensionUri, 'player', 'build', 'dist', 'universal-audio.js')) : "http://bevara.ddns.net/accessors-build/accessors-" + accessor_version + "/universal-audio.js",
							"video":isDev ? webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(
									this._context.extensionUri, 'player', 'build', 'dist', 'universal-video.js')) : "http://bevara.ddns.net/accessors-build/accessors-" + accessor_version + "/universal-video.js",
							"canvas":isDev ? webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(
								this._context.extensionUri, 'player', 'build', 'dist', 'universal-canvas.js')) : "http://bevara.ddns.net/accessors-build/accessors-" + accessor_version + "/universal-canvas.js",
							"artplayer":isDev ? webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(
								this._context.extensionUri, 'player', 'build', 'dist', 'artplayer.js')) : "http://bevara.ddns.net/accessors-build/accessors-"+accessor_version+"/artplayer.js"
						}
							
					});
				}
			} else if (e.type === 'save') {
				document.preserve();
			}
		});
	}

	/**
	 * Get the static HTML used for in our editor's webviews.
	 */
	private getHtmlForWebview(webview: vscode.Webview): string {
		// Local path to script for the webview
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(
			this._context.extensionUri, 'media', 'bevaraDraw.js'));


		const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(
			this._context.extensionUri, 'media', 'bevaraDraw.css'));

		// Use a nonce to whitelist which scripts can be run
		const nonce = getNonce();

		return /* html */`
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<link href="${styleMainUri}" rel="stylesheet" />
				<title>Bevara editor</title>
			</head>
			<body>
			<section>
    		<h1>Bevara editor</h1>
			
			<div style="display:none;" class="select-source">
			<h2>Select source:</h2>
			<input type="file" onChange="fileLoaded(this)" id="inputTag"></input>
			</div>

			<h2>Preview:</h2>
			<div class="drawing-preview"></div>
			<button class="md-chip md-chip-clickable md-chip-hover" onClick="preserveFile()"> Preserve </button>

			<h2>Messages:</h2>
			<textarea id="output" rows="8" readonly></textarea>

			<h2>Tag:</h2>
			<textarea id="htmlTag" rows="8" readonly></textarea>
			<button class="md-chip md-chip-clickable md-chip-hover" onClick="copyTag()"> Copy this tag to clipboard </button>

			<table>
			<tr>
			<tr>
			<td>
			tag
			</td>
			<td>
			<div class="md-chips tag-buttons"> </div>
			</td>
			</tr>
			<tr id="decoder_list">
			<td>
			decoders
			<input type="checkbox" onClick="toggleAllWith(this)" id="allWith" />
    <label for="allWith" class="md-chip md-chip-clickable md-chip-hover"> All</label>
			</td>
			<td>
			<div class="md-chips with-buttons"> </div>
			</td>
			</tr>
			<tr>
			<td>
			options
			</td>
			<td>
			<input type="checkbox" onClick="toggleUseCache(this)" name="UseCache" id="useCacheButton"> 
			<label for="useCacheButton" class="md-chip md-chip-clickable md-chip-hover">Use cache</label>
			<input type="checkbox" onClick="toggleShowProgess(this)" name="ShowProgess" id="showProgessButton"> 
			<label for="showProgessButton" class="md-chip md-chip-clickable md-chip-hover">Show progess</label>
			</td>
			</tr>
			<tr>
			<td>
			out
			</td>
			<td>
			<input type="checkbox" onClick="toggleOUT(this)" name="ouformat" id="png"> 
			<label for="png" class="md-chip md-chip-clickable md-chip-hover">png</label>
			<input type="checkbox" onClick="toggleOUT(this)" name="ouformat" id="jpg"> 
			<label for="jpg" class="md-chip md-chip-clickable md-chip-hover">jpg</label>
			<input type="checkbox" onClick="toggleOUT(this)" name="ouformat" id="rgb"> 
			<label for="rgb" class="md-chip md-chip-clickable md-chip-hover">rgb</label>
			<input type="checkbox" onClick="toggleOUT(this)" name="ouformat" id="rgba"> 
			<label for="rgba" class="md-chip md-chip-clickable md-chip-hover">rgba</label>
			</td>
			</tr>
			</table>
			</section>
			</body>
			<script nonce="${nonce}" src="${scriptUri}"></script>
			</html>`;
	}
}