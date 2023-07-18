import * as vscode from 'vscode';
import { BevaraPreservedEditorProvider } from './editors/BevaraPreservedEditor';
import { BevaraUnpreservedEditorProvider } from './editors/BevaraUnpreservedEditor';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(BevaraUnpreservedEditorProvider.register(context));
	context.subscriptions.push(BevaraPreservedEditorProvider.register(context));
}
