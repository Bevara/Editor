import * as vscode from 'vscode';
import { Disposable, disposeAll } from './dispose';

/**
 * Define the document (the data model) used for bevara draw files.
 */
export class BevaraDrawDocument extends Disposable implements vscode.CustomDocument {
	private readonly _uri: vscode.Uri;
	private _documentData: Uint8Array;
	private _ext: string | undefined;

	static async create(
		uri: vscode.Uri,
		backupId: string | undefined
	): Promise<BevaraDrawDocument | PromiseLike<BevaraDrawDocument>> {
		// If we have a backup, read that. Otherwise read the resource from the workspace
		const dataFile = typeof backupId === 'string' ? vscode.Uri.parse(backupId) : uri;
		const fileData = await BevaraDrawDocument.readFile(dataFile);
		return new BevaraDrawDocument(uri, fileData);
	}

	private static async readFile(uri: vscode.Uri): Promise<Uint8Array> {
		if (uri.scheme === 'untitled') {
			return new Uint8Array();
		}
		return new Uint8Array(await vscode.workspace.fs.readFile(uri));
	}

	public get documentData(): Uint8Array { return this._documentData; }
	public get extension(): string | undefined { return this._ext; }
	
	private constructor(
		uri: vscode.Uri,
		initialContent: Uint8Array
	) {
		super();
		this._uri = uri;
		this._documentData = initialContent;
		this._ext = uri? uri.path.split('.').pop(): undefined;
	}
	public get uri() { return this._uri; }

	private readonly _onDidDispose = this._register(new vscode.EventEmitter<void>());

	dispose(): void {
		this._onDidDispose.fire();
		super.dispose();
	}
}