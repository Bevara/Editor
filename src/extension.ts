import * as vscode from 'vscode';
import { BevaraPreservedEditorProvider } from './BevaraPreservedEditor';
import {BevaraUnpreservedEditorProvider} from './BevaraUnpreservedEditor';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(BevaraUnpreservedEditorProvider.register(context));
	context.subscriptions.push(BevaraPreservedEditorProvider.register(context));
}
