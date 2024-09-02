import * as vscode from 'vscode';
import { BevaraPreservedEditorProvider } from './editors/BevaraPreservedEditor';
import { BevaraUnpreservedEditorProvider } from './editors/BevaraUnpreservedEditor';
import { BevTreeDataProvider } from './explorer/BevExplorer';
import { BevaraAuthenticationProvider } from './auth/authProvider';

import * as fs from 'fs';
import * as path from 'path';
import { CompilationTreeProvider } from './sdk/compilationTree';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(BevaraPreservedEditorProvider.register(context));

	// Bevara explorer
	const bevExplorerProvider = new BevTreeDataProvider();
	vscode.window.registerTreeDataProvider('bevExplorer', bevExplorerProvider);
	vscode.workspace.registerTextDocumentContentProvider('accessor', bevExplorerProvider);

	// Bevara compiler
	//const bevCompilerProvider = new BevTreeDataProvider();
	//vscode.window.registerTreeDataProvider('bevCompiler', bevExplorerProvider);
	function getWebviewContent() {
		return `
			<html>
			<body>
				<h1>Welcome to Bevara compiler</h1>
				<p>This panel is shown because ".bevara" is present in the workspace.</p>
			</body>
			</html>`;
	}

	const disposable = vscode.commands.registerCommand('extension.showPanel', () => {
		const panel = vscode.window.createWebviewPanel(
			'myPanel', // Identifies the type of the webview. Used internally
			'Bevara compiler', // Title of the panel displayed to the user
			vscode.ViewColumn.One, // Editor column to show the new webview panel in.
			{}
		);

		// Set HTML content for the webview
		panel.webview.html = getWebviewContent();
	});

	context.subscriptions.push(disposable);

	const updateActivityBarVisibility = () => {
		// Optionally, you could automatically show the panel if the folder is present.
		const folderName = '.bevara';
		const workspaceFolders = vscode.workspace.workspaceFolders;

		if (workspaceFolders) {
			let folderExists = false;

			for (const folder of workspaceFolders) {
				const folderPath = path.join(folder.uri.fsPath, folderName);

				if (fs.existsSync(folderPath) && fs.lstatSync(folderPath).isDirectory()) {
					folderExists = true;
					break;
				}
			}

			if (folderExists) {
				vscode.commands.executeCommand('extension.showPanel');
				vscode.commands.executeCommand('setContext', 'showSDK', true);
			}else{
				vscode.commands.executeCommand('setContext', 'showSDK', false);
			}
		}
	};


	updateActivityBarVisibility();
	vscode.workspace.onDidChangeWorkspaceFolders(updateActivityBarVisibility);

	const rootPath = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
		? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;
	const nodeDependenciesProvider = new CompilationTreeProvider(rootPath);
	vscode.window.registerTreeDataProvider('bevara-compiler', nodeDependenciesProvider);
	vscode.commands.registerCommand('bevara-compiler.refreshEntry', () => nodeDependenciesProvider.refresh());


	const bevaraAuthenticationProvider = new BevaraAuthenticationProvider(context.secrets);


	context.subscriptions.push(vscode.authentication.registerAuthenticationProvider(
		BevaraAuthenticationProvider.id,
		'Bevara Authentification',
		bevaraAuthenticationProvider,
	));

	context.subscriptions.push(BevaraUnpreservedEditorProvider.register(context, bevaraAuthenticationProvider));

	vscode.commands.registerCommand('bevexplorer.exploreBevFile', (url: string, filter: string) => {
		if (url) {
			const uri = vscode.Uri.parse(url);
			bevExplorerProvider.openBev(uri, filter);
		} else {
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
