import * as vscode from 'vscode';
import { BevaraPreservedEditorProvider } from './editors/BevaraPreservedEditor';
import { BevaraUnpreservedEditorProvider } from './editors/BevaraUnpreservedEditor';
import { BevTreeDataProvider } from './explorer/BevExplorer';
import { BevaraAuthenticationProvider } from './auth/authProvider';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(BevaraPreservedEditorProvider.register(context));
	const bevExplorerProvider = new BevTreeDataProvider();
	vscode.window.registerTreeDataProvider('bevExplorer', bevExplorerProvider);
	vscode.workspace.registerTextDocumentContentProvider('accessor', bevExplorerProvider);
	
	const bevaraAuthenticationProvider = new BevaraAuthenticationProvider(context.secrets);


	context.subscriptions.push(vscode.authentication.registerAuthenticationProvider(
		BevaraAuthenticationProvider.id,
		'Bevara Authentification',
		bevaraAuthenticationProvider,
	));

	context.subscriptions.push(BevaraUnpreservedEditorProvider.register(context, bevaraAuthenticationProvider));

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
