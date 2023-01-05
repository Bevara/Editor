import * as vscode from 'vscode';
import { PreservedDocument } from '../documents/PreservedDocument';
import { WebviewCollection } from '../webviewCollection';
import { getNonce } from '../util';

export class BevaraPreservedEditorProvider implements vscode.CustomEditorProvider<PreservedDocument> {
	private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<PreservedDocument>>();
	public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

	private static readonly viewType = 'bevara.preserved';

	/**
	 * Tracks all known webviews
	 */
	private readonly webviews = new WebviewCollection();


	constructor(
		private readonly _context: vscode.ExtensionContext
	) {


	}

	private postMessage(panel: vscode.WebviewPanel, type: string, body: any): void {
		panel.webview.postMessage({ type, body });
	}

	saveCustomDocument(document: PreservedDocument, cancellation: vscode.CancellationToken): Thenable<void> {
		throw new Error('Method not implemented.');
	}
	saveCustomDocumentAs(document: PreservedDocument, destination: vscode.Uri, cancellation: vscode.CancellationToken): Thenable<void> {
		throw new Error('Method not implemented.');
	}
	revertCustomDocument(document: PreservedDocument, cancellation: vscode.CancellationToken): Thenable<void> {
		throw new Error('Method not implemented.');
	}
	backupCustomDocument(document: PreservedDocument, context: vscode.CustomDocumentBackupContext, cancellation: vscode.CancellationToken): Thenable<vscode.CustomDocumentBackup> {
		throw new Error('Method not implemented.');
	}
	async openCustomDocument(uri: vscode.Uri, openContext: vscode.CustomDocumentOpenContext, token: vscode.CancellationToken): Promise<PreservedDocument> {
		const document: PreservedDocument = await PreservedDocument.create(uri, openContext.backupId);

		return document;
	}
	resolveCustomEditor(document: PreservedDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken): void | Thenable<void> {
		// Add the webview to our internal set of active webviews
		this.webviews.add(document.uri, webviewPanel);

		// Setup initial content for the webview
		webviewPanel.webview.options = {
			enableScripts: true,
		};

		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

		webviewPanel.webview.onDidReceiveMessage(e => {
			if (e.type === 'ready') {
				this.postMessage(webviewPanel, 'init', {
					value: document.documentData,
					supported:document.supported
				});
			}

		});
	}

	/**
	 * Get the static HTML used for in our editor's webviews.
	 */
	private getHtmlForWebview(webview: vscode.Webview): string {
		const isDev = true;

		// Local path to script for the webview
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(
			this._context.extensionUri, 'media', 'preserved.js'));


		const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(
			this._context.extensionUri, 'media', 'bevaraDraw.css'));

		const universalImg: vscode.Uri | string = isDev ? webview.asWebviewUri(vscode.Uri.joinPath(
			this._context.extensionUri, 'player', 'build', 'dist', 'universal-img.js')) : "http://bevara.ddns.net/accessors/universal-img.js";


		// Use a nonce to whitelist which scripts can be run
		const nonce = getNonce();

		return /* html */`
			<!DOCTYPE html>
			<html lang="en">
			<head>
			<meta charset="UTF-8">
			<link href="${styleMainUri}" rel="stylesheet" />
			<title>Bevara viewser</title>
			</head>
			<body>
			<section>
			<h1>Bevara viewer</h1>
			<div class="drawing-preview"></div>
			</section>
			</body>
			<script src="${universalImg}"></script>
			<script nonce="${nonce}" src="${scriptUri}"></script>
			</html>`;
	}

	public static register(context: vscode.ExtensionContext): vscode.Disposable {

		return vscode.window.registerCustomEditorProvider(
			BevaraPreservedEditorProvider.viewType,
			new BevaraPreservedEditorProvider(context),
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

}