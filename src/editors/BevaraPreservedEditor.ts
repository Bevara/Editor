import * as vscode from 'vscode';
import { PreservedDocument } from '../documents/PreservedDocument';
import { WebviewCollection } from '../webviewCollection';

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
	}

	/**
	 * Get the static HTML used for in our editor's webviews.
	 */
	private getHtmlForWebview(webview: vscode.Webview): string {
		const universalImg: vscode.Uri | string = "http://bevara.ddns.net/accessors/universal-img.js";

		return /* html */`
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<title>Bevara editor</title>
			</head>
			<body>
			</body>
			<script src="${universalImg}"></script>
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