import * as vscode from 'vscode';
import { BevaraDocumentDelegate } from './bevaraDrawDocumentDelegate';
import { BevaraDrawEdit } from './bevaraDrawEdit';
import { Disposable, disposeAll } from './dispose';

/**
 * Define the document (the data model) used for bevara draw files.
 */
export class BevaraDrawDocument extends Disposable implements vscode.CustomDocument {
	private readonly _uri: vscode.Uri;
	private _documentData: Uint8Array;
	private _edits: Array<BevaraDrawEdit> = [];
	private _savedEdits: Array<BevaraDrawEdit> = [];
	private readonly _delegate: BevaraDocumentDelegate;

	static async create(
		uri: vscode.Uri,
		backupId: string | undefined,
		delegate: BevaraDocumentDelegate
	): Promise<BevaraDrawDocument | PromiseLike<BevaraDrawDocument>> {
		// If we have a backup, read that. Otherwise read the resource from the workspace
		const dataFile = typeof backupId === 'string' ? vscode.Uri.parse(backupId) : uri;
		const fileData = await BevaraDrawDocument.readFile(dataFile);
		return new BevaraDrawDocument(uri, fileData, delegate);
	}

	private static async readFile(uri: vscode.Uri): Promise<Uint8Array> {
		if (uri.scheme === 'untitled') {
			return new Uint8Array();
		}
		return new Uint8Array(await vscode.workspace.fs.readFile(uri));
	}

	public get documentData(): Uint8Array { return this._documentData; }

	private constructor(
		uri: vscode.Uri,
		initialContent: Uint8Array,
		delegate: BevaraDocumentDelegate
	) {
		super();
		this._uri = uri;
		this._documentData = initialContent;
		this._delegate = delegate;
	}
	public get uri() { return this._uri; }

	
	private readonly _onDidDispose = this._register(new vscode.EventEmitter<void>());
	
	/**
	 * Fired when the document is disposed of.
	 */
	public readonly onDidDispose = this._onDidDispose.event;

	private readonly _onDidChangeDocument = this._register(new vscode.EventEmitter<{
		readonly content?: Uint8Array;
		readonly edits: readonly BevaraDrawEdit[];
	}>());

	/**
	 * Fired to notify webviews that the document has changed.
	 */
	public readonly onDidChangeContent = this._onDidChangeDocument.event;

	private readonly _onDidChange = this._register(new vscode.EventEmitter<{
		readonly label: string,
		undo(): void,
		redo(): void,
	}>());

	/**
	 * Fired to tell VS Code that an edit has occurred in the document.
	 *
	 * This updates the document's dirty indicator.
	 */
	public readonly onDidChange = this._onDidChange.event;

	dispose(): void {
		this._onDidDispose.fire();
		super.dispose();
	}

	/**
	  * Called by VS Code when the user saves the document.
	  */
	async save(cancellation: vscode.CancellationToken): Promise<void> {
		await this.saveAs(this.uri, cancellation);
		this._savedEdits = Array.from(this._edits);
	}

	/**
	 * Called by VS Code when the user saves the document to a new location.
	 */
	async saveAs(targetResource: vscode.Uri, cancellation: vscode.CancellationToken): Promise<void> {
		const fileData = await this._delegate.getFileData();
		if (cancellation.isCancellationRequested) {
			return;
		}
		await vscode.workspace.fs.writeFile(targetResource, fileData);
	}
}