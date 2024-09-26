import * as vscode from 'vscode';
import * as fs from 'fs';
import * as AdmZip from 'adm-zip';

import { filterDescFromFilterName, getCMakeFromUri, getFilterNameFromCMake, getFilterVersionFromCMake, getOutputFromCmake } from '../filters/cmake';
import { getArtifact, GitHubRepoContext, listArtifacts } from '../git/repository';


function checkGlobalStorateInitialized(context: vscode.ExtensionContext){
	if (!fs.existsSync(context.globalStoragePath)) {
		fs.mkdirSync(context.globalStoragePath, { recursive: true });
	}
}

function decompressArtifact(buffer : Buffer){
	const files: { [key: string]: Buffer} = {};
	const zip = new AdmZip(buffer);

	zip.getEntries()
	.sort((a:any,b:any) => a.entryName.localeCompare(b.entryName))
	.forEach((e:any) => {
		files[e.entryName] = e.getData();
	});
	return files;
}

export async function addToLibs(context: vscode.ExtensionContext, repoContext: GitHubRepoContext, artifact_id: number) {
	const filter_list: any = context.globalState.get("filterList");

	
	checkGlobalStorateInitialized(context);
	const artifacts = await listArtifacts(repoContext, artifact_id);
	if (artifacts.length != 1) {
		return;
	}
	const buffer = await getArtifact(repoContext, artifacts[0].id);
	const files = decompressArtifact(buffer);		

	Object.keys(files).filter(x => x.endsWith(".wasm"))
	.forEach((x:string)=>{
		const filterName = x.substring(0, x.lastIndexOf(".wasm"));
		const fs_file = vscode.Uri.joinPath(context.globalStorageUri, x).fsPath;
		fs.writeFileSync(fs_file, files[x]);
		if (filterName+".json" in files){
			const jsonData = files[filterName+".json"].toString('utf8');
			const filterDesc = JSON.parse(jsonData);
			filterDesc.isDev = true;
			filterDesc.owner = repoContext.owner;
			filterDesc.repo = repoContext.name;
			filterDesc.source = repoContext.workspaceUri;
			filterDesc.artifact_id = artifact_id;

			filter_list[x] = filterDesc;
		}
	});

	context.globalState.update("filterList", filter_list);
}

export function getLastArtifactId(context: vscode.ExtensionContext, repoContext: GitHubRepoContext){
	const filter_list: any = context.globalState.get("filterList");

	const filter :any= Object.values(filter_list).find((x:any) => x.owner == repoContext.owner && x.repo == repoContext.name && x.isDev == true);

	return filter? filter.artifact_id : null;
}