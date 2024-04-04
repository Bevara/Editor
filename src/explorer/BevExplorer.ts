import { commands, CancellationToken, Event, EventEmitter, ProviderResult, TextDocumentContentProvider, TreeDataProvider, TreeItem, Uri, TreeItemCollapsibleState } from "vscode";
import { IBevNode, treeFromPaths } from "./BevNode";

import * as AdmZip from 'adm-zip';
import * as path from 'path';
import axios, {isCancel, AxiosError} from 'axios';

const joinPath = require('path.join');

export class BevRoot implements IBevNode {
	private _bevRoots: BevRoot[] = [];
	private _tree: IBevNode;
	private _zip: AdmZip;


	constructor(private _buffer: Buffer, private _uri:Uri, private _filter : string) {
			const files: any[] = [];
			this._zip = new AdmZip(_buffer);

			this._zip.getEntries()
			.sort((a:any,b:any) => a.entryName.localeCompare(b.entryName))
			.forEach((e:any) => {
				files.push(e.entryName);
			});
	
			this._tree = treeFromPaths(files, _uri,
                _filter);
	}

	public getText(filePath: string): Thenable<string> {
        return new Promise((resolve, reject) => {
            try {
                this._zip.readAsTextAsync(filePath, resolve);
            } catch (error : any) {
                reject(error.toString());
            }
        });
    }

	public get sourceUri(): Uri  {
		return this._uri;
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
			this._bevRoots.forEach(zip => {
                if (uri.fsPath.startsWith(zip.sourceUri.fsPath)) {
                    const filePath = uri.path.substr(zip.sourceUri.path.length + 1);
                    resolve(zip.getText(filePath) );
                }
            });
		});
	}

	public async openBev(uri: Uri, filter: string) {
		const root = this._bevRoots.find(x => x.sourceUri.path == uri.path);
		if (root){
			return root;
		}

		const body = await axios.get(uri.toString(), {
			responseType: 'arraybuffer',
		});
		const new_root = new BevRoot(body.data, uri, filter);
		this._bevRoots.push(new_root);
		return new_root;
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

	getTreeItem(element: IBevNode): TreeItem {
		const isFile = this.getType(element) === 'file';
		let command = undefined;

		if (isFile) {
            command = {
                command: 'openBevResource',
                arguments: [element.sourceUri.with({
                    scheme: 'accessor',
                    path: joinPath(element.sourceUri.path, element.parent, element.label)
                })],
                title: 'Open Bevara Resource'
            };
        }

		return {
            label: element.label,
            collapsibleState: isFile ? void 0 : TreeItemCollapsibleState.Expanded,
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

	public openBev(uri: Uri, filter : string) {
		this.model.openBev(uri, filter)
		.then((root)=>{

			if (filter){
				const uri = root.sourceUri.with({
					scheme: 'accessor',
					path: joinPath(root.sourceUri.path, filter)
				});
				commands.executeCommand('openBevResource', uri);
			}
			this._onDidChangeTreeData.fire(null);
		});
	}
}