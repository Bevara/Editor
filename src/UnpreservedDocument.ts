import * as vscode from 'vscode';
import * as JSZip from 'jszip';
import { Utils } from 'vscode-uri';


import { BevaraDocumentDelegate } from './bevaraDrawDocumentDelegate';
import { BevaraDrawEdit } from './bevaraDrawEdit';
import { Disposable, disposeAll } from './dispose';

/**
 * Define the document (the data model) used for bevara draw files.
 */
export class UnpreservedDocument extends Disposable implements vscode.CustomDocument {
	private readonly _uri: vscode.Uri;
	private _documentData: Uint8Array;
	private _edits: Array<BevaraDrawEdit> = [];
	private _savedEdits: Array<BevaraDrawEdit> = [];
	private readonly _delegate: BevaraDocumentDelegate;

	static async create(
		uri: vscode.Uri,
		backupId: string | undefined,
		delegate: BevaraDocumentDelegate
	): Promise<UnpreservedDocument | PromiseLike<UnpreservedDocument>> {
		// If we have a backup, read that. Otherwise read the resource from the workspace
		const dataFile = typeof backupId === 'string' ? vscode.Uri.parse(backupId) : uri;
		const fileData = await UnpreservedDocument.readFile(dataFile);
		return new UnpreservedDocument(uri, fileData, delegate);
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

	async packageData(data: any): Promise<Uint8Array> {
		const zip = new JSZip();
		const sourceUri = vscode.Uri.parse(data.uri);
		const sourceName = Utils.basename(sourceUri);
		zip.file(sourceName.toString(), data.source);

		for (const decoder of data.with) {
			zip.file(decoder.name, decoder.data);
		}

		zip.file(data.core.name, data.core.data);
		zip.file("meta.json", 
		JSON.stringify({
			supported : data.supported,
			source:sourceName.toString(),
			core:data.core.name, 
			decoders:data.with.map((x:any)=>x.name)
		}));
		return zip.generateAsync({ type: "uint8array" });
	}

	/**
	 * Called by VS Code when the user saves the document to a new location.
	 */
	async saveAs(targetResource: vscode.Uri, cancellation: vscode.CancellationToken): Promise<void> {
		const bevaraData = await this._delegate.getFileData();
		const bevaraFile = await this.packageData(bevaraData);
		if (cancellation.isCancellationRequested) {
			return;
		}


		const newTargetResource = 
			vscode.Uri.parse(targetResource.toString() + ".bev");


		await vscode.workspace.fs.writeFile(newTargetResource, bevaraFile);
	}

	/**
	 * Called by VS Code when the user saves the document to a new location.
	 */
	async preserve(): Promise<void> {
		const bevaraData = await this._delegate.getFileData();
		const bevaraFile = await this.packageData(bevaraData);

		const newTargetResource = vscode.Uri.parse(this.uri.toString() + ".bev");
		await vscode.workspace.fs.writeFile(newTargetResource, bevaraFile);
	}
}