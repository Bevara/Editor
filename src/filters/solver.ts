
import * as vscode from 'vscode';
import * as fs from 'fs';
import { checkGlobalStorateInitialized } from './utils';
import { Credentials } from '../auth/credentials';
import { Workflow } from '../workflows/actions/model';
import { getArtifact, getLastCompletedRun, listArtifacts } from '../git/repository';
import { decompressArtifact } from './libraries';

const bevaraRepo = {
	repo: "solver",
	owner: "Bevara",
	branch : "main"
};

export function checkSolver(storageUri: vscode.Uri) {
	return fs.existsSync(vscode.Uri.joinPath(storageUri, "solver_1.js").fsPath) && fs.existsSync(vscode.Uri.joinPath(storageUri, "solver_1.wasm").fsPath);
}


export async function downloadSolver(context: vscode.ExtensionContext, credentials : Credentials) {
	checkGlobalStorateInitialized(context);

	try {
		const last_completed_run = await getLastCompletedRun(credentials.octokit, bevaraRepo.repo, bevaraRepo.owner, bevaraRepo.branch);
		
		if (!last_completed_run) {
			vscode.window.showErrorMessage('Internal error on the solver repository : no completed run');
			throw 'Internal error on the solver repository : no completed run';
		}

		const artifacts = await listArtifacts(credentials.octokit, bevaraRepo.repo, bevaraRepo.owner, last_completed_run.id);
		if (artifacts.length == 0 ){
			vscode.window.showErrorMessage('Internal error on the solver repository : no artifacts');
			throw 'Internal error on the solver repository : no artifacts';
		}

		const buffer = await getArtifact(credentials.octokit, bevaraRepo.repo, bevaraRepo.owner, artifacts[0].id);
		const files = decompressArtifact(buffer);

		const opts = await credentials.octokit.actions.listRepoWorkflows.endpoint.merge(bevaraRepo);
		const workflows = await credentials.octokit.paginate<Workflow>(opts);

		workflows.sort((a:any, b:any) => a.name.localeCompare(b.name));

		if (workflows.length == 0){
			vscode.window.showErrorMessage('Internal error on the solver repository');
			throw 'Internal error on the solver repository';
		}
		const workflow = workflows[0];
		
		const workflowRunArtifacts = await credentials.octokit.actions.listWorkflowRunArtifacts({
			owner: bevaraRepo.owner,
			repo: bevaraRepo.repo,
			run_id: workflow.id
		});

		const repoInfo = await credentials.octokit.repos.get({
			repo: "solver",
			owner: "Bevara"
		});
		console.log(repoInfo);
	} catch (e : any) {
		vscode.window.showErrorMessage("Can't download solver from Bevara :"+ e.message);

		//logError(e as Error, "Error getting GitHub context");

		// Rethrow original error
		throw e;
	}
}