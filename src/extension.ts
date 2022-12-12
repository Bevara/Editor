import * as vscode from 'vscode';
import {BevaraDrawEditorProvider} from './bevaraDrawEditor';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(BevaraDrawEditorProvider.register(context));
}
