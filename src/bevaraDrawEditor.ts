import * as vscode from 'vscode';
import { BevaraDrawDocument } from "./bevaraDrawDocument";
import { getNonce } from './util';
import { WebviewCollection } from './webviewCollection';

export class BevaraDrawEditorProvider implements vscode.CustomEditorProvider<BevaraDrawDocument> {
	private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<BevaraDrawDocument>>();
	public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

	private static readonly viewType = 'bevara.pipeline';
	private static newBevaraDrawFileId = 1;

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

			const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, `new-${BevaraDrawEditorProvider.newBevaraDrawFileId++}.pipeline`)
				.with({ scheme: 'untitled' });

			vscode.commands.executeCommand('vscode.openWith', uri, BevaraDrawEditorProvider.viewType);
		});

		return vscode.window.registerCustomEditorProvider(
			BevaraDrawEditorProvider.viewType,
			new BevaraDrawEditorProvider(context),
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

	saveCustomDocument(document: BevaraDrawDocument, cancellation: vscode.CancellationToken): Thenable<void> {
		throw new Error('Method not implemented.');
	}
	saveCustomDocumentAs(document: BevaraDrawDocument, destination: vscode.Uri, cancellation: vscode.CancellationToken): Thenable<void> {
		throw new Error('Method not implemented.');
	}
	revertCustomDocument(document: BevaraDrawDocument, cancellation: vscode.CancellationToken): Thenable<void> {
		throw new Error('Method not implemented.');
	}
	backupCustomDocument(document: BevaraDrawDocument, context: vscode.CustomDocumentBackupContext, cancellation: vscode.CancellationToken): Thenable<vscode.CustomDocumentBackup> {
		throw new Error('Method not implemented.');
	}
	async openCustomDocument(uri: vscode.Uri, openContext: vscode.CustomDocumentOpenContext, token: vscode.CancellationToken):
		Promise<BevaraDrawDocument> {
		const document: BevaraDrawDocument = await BevaraDrawDocument.create(uri, openContext.backupId);

		return document;
	}

	private postMessage(panel: vscode.WebviewPanel, type: string, body: any): void {
		panel.webview.postMessage({ type, body });
	}


	resolveCustomEditor(document: BevaraDrawDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken): void | Thenable<void> {
		// Add the webview to our internal set of active webviews
		this.webviews.add(document.uri, webviewPanel);

		// Setup initial content for the webview
		webviewPanel.webview.options = {
			enableScripts: true,
		};
		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

		// Wait for the webview to be properly ready before we init
		webviewPanel.webview.onDidReceiveMessage(e => {
			if (e.type === 'ready') {
				this.postMessage(webviewPanel, 'init', {
					uri: document.uri,
					value: document.documentData,
					ext: document.extension
				});
			}
		});
	}

	/**
	 * Get the static HTML used for in our editor's webviews.
	 */
	private getHtmlForWebview(webview: vscode.Webview): string {
		const isDev = false;

		// Local path to script for the webview
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(
			this._context.extensionUri, 'media', 'bevaraDraw.js'));


		const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(
			this._context.extensionUri, 'media', 'bevaraDraw.css'));

		const universalImg : vscode.Uri | string =isDev ? webview.asWebviewUri(vscode.Uri.joinPath(
				this._context.extensionUri, 'player', 'build', 'dist', 'universal-img.js')) : "http://bevara.ddns.net/accessors/universal-img.js";

				
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
			<h2>Tag:</h2>
			<div class="drawing-tag"></div>

			<h2>Preview:</h2>
			<div class="drawing-preview"></div>

			<h2>Messages:</h2>
			<textarea id="output" rows="8" readonly></textarea>

			<h2>Options:</h2>
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
			<tr>
			<td>
			using
			</td>
			<td>
			<div class="md-chips using-buttons"> </div>
			</td>
			</tr>
			<tr>
			<td>
			with
			<input type="checkbox" onClick="toggleAllWith(this)" id="allWith" />
    <label for="allWith" class="md-chip md-chip-clickable md-chip-hover"> Enable_all</label>
			</td>
			<td>
			<div class="md-chips with-buttons"> </div>
			</td>
			</tr>
			</table>
			</section>
			</body>
			<script src="${universalImg}"></script>
			<script nonce="${nonce}" src="${scriptUri}"></script>
			</html>`;
	}
}