import * as vscode from 'vscode';

function getBevaraContext(context : vscode.ExtensionContext){
	const bevara_sdk = context.globalState.get("bevara_sdk") as any;
	if (!bevara_sdk){
		return {};
	}

	return bevara_sdk;
}

export function isEulaAccepted(context : vscode.ExtensionContext) {
	const eula_accepted = getBevaraContext(context).eula_accepted;
	return eula_accepted == null ? false : eula_accepted;
}

export function setEulaAccepted(context : vscode.ExtensionContext, value: boolean) {
	const bevara_sdk = getBevaraContext(context);
	bevara_sdk.eula_accepted = value;
	context.globalState.update("bevara_sdk", bevara_sdk);
}

export function isInternalCompiler(context : vscode.ExtensionContext) {
	const internal_compiler = getBevaraContext(context).internal_compiler;
	return internal_compiler == null ? false : internal_compiler;
}

export function setInternalCompiler(context : vscode.ExtensionContext, value: boolean) {
	const bevara_sdk = getBevaraContext(context);
	bevara_sdk.internal_compiler = value;
	context.globalState.update("bevara_sdk", bevara_sdk);
}

export function showPopUp(context : vscode.ExtensionContext) {
	const showPopUp = getBevaraContext(context).showPopUp;
	return showPopUp == null ? true : showPopUp;
}

export function setshowPopUp(context : vscode.ExtensionContext, value: boolean) {
	const bevara_sdk = getBevaraContext(context);
	bevara_sdk.showPopUp = value;
	context.globalState.update("bevara_sdk", bevara_sdk);
}