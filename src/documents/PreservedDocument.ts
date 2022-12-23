import * as vscode from 'vscode';
import { Disposable, disposeAll } from '../dispose';

/**
 * Define the document (the data model) used for bevara draw files.
 */
export class PreservedDocument extends Disposable implements vscode.CustomDocument {
	private readonly _uri: vscode.Uri;

	static async create(
		uri: vscode.Uri,
		backupId: string | undefined
	): Promise<PreservedDocument | PromiseLike<PreservedDocument>> {
		return new PreservedDocument(uri);
	}

	private constructor(
		uri: vscode.Uri
	) {
		super();
		this._uri = uri;
	}
	public get uri() { return this._uri; }
}