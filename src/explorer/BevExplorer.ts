import { window, CancellationToken, Event, EventEmitter, ProviderResult, TextDocumentContentProvider, TreeDataProvider, TreeItem, Uri, TreeItemCollapsibleState } from "vscode";
import { IBevNode, treeFromPaths } from "./BevNode";

import * as AdmZip from 'adm-zip';
import * as path from 'path';
import axios, {isCancel, AxiosError} from 'axios';

const joinPath = require('path.join');

export class BevRoot implements IBevNode {
	private _bevRoots: BevRoot[] = [];
	private _tree: IBevNode;
	private _zip: AdmZip;


	constructor(private _buffer: Buffer, private _uri:string) {
			const files: any[] = [];
			this._zip = new AdmZip(_buffer);

			this._zip.getEntries()
			.sort((a:any,b:any) => a.entryName.localeCompare(b.entryName))
			.forEach((e:any) => {
				files.push(e.entryName);
			});
			const label = this._uri.substring(0, this._uri.indexOf('.accessor'));
			this._tree = treeFromPaths(files,
				path.basename(label));
	}

	

	public get sourceUri(): Uri | undefined {
		return undefined;
	}
	public get label(): string {
		return this._tree.label;
	}

	public get parent(): string | null {
		return this._tree.parent;
	}

	public get nodes() {
		return this._tree.nodes;
	}
}

class BevModel {
	private _bevRoots: BevRoot[] = [];

	public getContent(uri: Uri): Thenable<string> {
		return new Promise((resolve, reject) => {
			resolve("test");
		});
	}

	public async openBev(url: string) {
		const body = await axios.get(url, {
			responseType: 'arraybuffer',
		});
		this._bevRoots.push(new BevRoot(body.data, url));
	}

	public get roots() {
		return this._bevRoots;
	}
}

export class BevTreeDataProvider implements TreeDataProvider<IBevNode>, TextDocumentContentProvider {
	private model: BevModel;
	private _onDidChangeTreeData: EventEmitter<any> = new EventEmitter<any>();
	readonly onDidChangeTreeData: Event<any> = this._onDidChangeTreeData.event;

	constructor() {
		this.model = new BevModel();
	}

	public clear() {
        this.model = new BevModel();
        this._onDidChangeTreeData.fire(null);
    }

	getTreeItem(element: IBevNode): TreeItem | Thenable<TreeItem> {
		const isFile = this.getType(element) === 'file';
		let command = undefined;

		if (isFile && element.label) {
            command = {
                command: 'openBevResource',
                arguments: [
					joinPath(element.label, element.parent, element.label)
				],
                title: 'Open Bevara Resource'
            };
        }

		return {
            label: element.label,
            collapsibleState: isFile ? void 0 : TreeItemCollapsibleState.Collapsed,
            command: command,
            iconPath: undefined,
            contextValue: this.getType(element)
        };
	}

	private getType(element: IBevNode): string {
        if (element.parent === null) {
            return 'accessor';
        } else if (element.label.endsWith('/')) {
            return 'folder';
        } else {
            return 'file';
        }
    }

	getChildren(element?: IBevNode): IBevNode[] {
		if (!element) {
			return this.model.roots;
		}
		return element.nodes;
	}
	getParent?(element: IBevNode): ProviderResult<IBevNode> {
		throw new Error("getParent not implemented.");
	}
	resolveTreeItem?(item: TreeItem, element: IBevNode, token: CancellationToken): ProviderResult<TreeItem> {
		throw new Error("resolveTreeItem not implemented.");
	}

	public provideTextDocumentContent(uri: Uri, token: CancellationToken): ProviderResult<string> {
		return this.model.getContent(uri);
	}

	public openBev(url: string) {
		this.model.openBev(url)
		.then(()=>{
			this._onDidChangeTreeData.fire(null);
		});
	}
}