import * as vscode from 'vscode';
import * as fs from 'fs';

export function checkGlobalStorateInitialized(context: vscode.ExtensionContext) {
	if (!fs.existsSync(context.globalStoragePath)) {
		fs.mkdirSync(context.globalStoragePath, { recursive: true });
	}
}
