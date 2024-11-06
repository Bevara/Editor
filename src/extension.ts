import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { BevaraPreservedEditorProvider } from './editors/BevaraPreservedEditor';
import { BevaraUnpreservedEditorProvider } from './editors/BevaraUnpreservedEditor';
import { BevTreeDataProvider } from './explorer/BevExplorer';
import { BevaraAuthenticationProvider } from './auth/authProvider';
import { RunStore } from './workflows/actions/store';
import { initResources } from './workflows/actions/icons';
import { initSdkTreeViews } from './sdk/sdkTreeViews';
import {WelcomePanel } from './sdk/welcomeWebviewProvider';
import { isEulaAccepted } from './sdk/options';
import { registerOpenWorkflowStepLogs } from './commands/openWorkflowStepLogs';
import { registerOpenWorkflowJobLogs } from './commands/openWorkflowJobLogs';
import { ActionsLogScheme, InternaJobLogScheme, InternaStepLogScheme } from './logs/constants';
import { ActionsWorkflowStepLogProvider, InternalWorkflowJobLogProvider, InternalWorkflowStepLogProvider } from './logs/fileProvider';
import { registerRerunCompilation } from './commands/rerunWorkflowRun';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(BevaraPreservedEditorProvider.register(context));

	// Bevara explorer
	const bevExplorerProvider = new BevTreeDataProvider();
	vscode.window.registerTreeDataProvider('bevExplorer', bevExplorerProvider);
	vscode.workspace.registerTextDocumentContentProvider('accessor', bevExplorerProvider);



	const disposable = vscode.commands.registerCommand('bevara-compiler.showWelcomePanel', () => {
		WelcomePanel.createOrShow(context);
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
				vscode.commands.executeCommand('bevara-compiler.showWelcomePanel');
				if (isEulaAccepted(context)){
					vscode.commands.executeCommand('setContext', 'showSDK', true);
				}
			}else{
				vscode.commands.executeCommand('setContext', 'showSDK', false);
			}
		}
	};


	updateActivityBarVisibility();
	vscode.workspace.onDidChangeWorkspaceFolders(updateActivityBarVisibility);
	
	const bevaraAuthenticationProvider = new BevaraAuthenticationProvider(context.secrets);
	const store = new RunStore();
	initResources(context);
	initSdkTreeViews(context, store, bevaraAuthenticationProvider);
	registerRerunCompilation(context);
	registerOpenWorkflowStepLogs(context);
	registerOpenWorkflowJobLogs(context);

	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(ActionsLogScheme, new ActionsWorkflowStepLogProvider())
	);

	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(InternaJobLogScheme, new InternalWorkflowJobLogProvider())
	);

	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(InternaStepLogScheme, new InternalWorkflowStepLogProvider())
	);

	context.subscriptions.push(vscode.authentication.registerAuthenticationProvider(
		BevaraAuthenticationProvider.id,
		'Bevara Authentication',
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
