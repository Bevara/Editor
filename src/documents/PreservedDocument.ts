import * as vscode from 'vscode';
import * as JSZip from 'jszip';
import { Disposable, disposeAll } from '../dispose';

/**
 * Define the document (the data model) used for bevara draw files.
 */
export class PreservedDocument extends Disposable implements vscode.CustomDocument {
	private readonly _uri: vscode.Uri;
	private _rawData: Uint8Array;
	private _meta: any;

	static async create(
		uri: vscode.Uri,
		backupId: string | undefined
	): Promise<PreservedDocument | PromiseLike<PreservedDocument>> {
		const bevaraFileData = await PreservedDocument.readFile(uri);
		const zipContent = await new JSZip().loadAsync(bevaraFileData);
		if (!zipContent){
			throw new Error('Unsupported or wrong format for this file.');
		}
		
		const zip_meta = await zipContent.file("meta.json");
		if (!zip_meta){
			throw new Error('Metadata is missing in this file.');
		}

		const meta = JSON.parse(await zip_meta.async("string"));
		return new PreservedDocument(uri, bevaraFileData, meta);
	}

	public get documentData(): Uint8Array { return this._rawData; }

	private static async readFile(uri: vscode.Uri): Promise<Uint8Array> {
		if (uri.scheme === 'untitled') {
			return new Uint8Array();
		}
		return new Uint8Array(await vscode.workspace.fs.readFile(uri));
	}

	private constructor(
		uri: vscode.Uri,
		initialContent: Uint8Array,
		meta:any
	) {
		super();
		this._uri = uri;
		this._rawData = initialContent;
		this._meta = meta;
	}
	public get uri() { return this._uri; }

	public get supported(){
		return this._meta.supported[0];
	}
}