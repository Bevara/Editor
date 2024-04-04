import * as vscode from 'vscode';
import { BevaraPreservedEditorProvider } from './editors/BevaraPreservedEditor';
import { BevaraUnpreservedEditorProvider } from './editors/BevaraUnpreservedEditor';
import { BevTreeDataProvider } from './explorer/BevExplorer';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(BevaraUnpreservedEditorProvider.register(context));
	context.subscriptions.push(BevaraPreservedEditorProvider.register(context));
	const bevExplorerProvider = new BevTreeDataProvider();
	vscode.window.registerTreeDataProvider('bevExplorer', bevExplorerProvider);
	vscode.workspace.registerTextDocumentContentProvider('accessor', bevExplorerProvider);

	vscode.commands.registerCommand('bevexplorer.exploreBevFile', (url: string, filter:string) => {
		if (url){
			const uri = vscode.Uri.parse(url);
			bevExplorerProvider.openBev(uri, filter);
		}else {
			throw new Error("No sources provided for the current accessor.");
		}

    });

	vscode.commands.registerCommand('bevexplorer.clear', () => {
        bevExplorerProvider.clear();
    });

	vscode.commands.registerCommand('openBevResource', (uri: vscode.Uri) => {
		vscode.workspace.openTextDocument(uri).then(document => {
            if (document) {
                vscode.window.showTextDocument(document);
            }
        });
    });
}
