import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getCurrentBranch, getGitHubContext, GitHubRepoContext } from '../git/repository';
import { WorkflowRunNode } from '../workflows/actions/workflowRunNode';
import { WorkflowRunTreeDataProvider } from '../workflows/actions/workflowRunTreeDataProvider';
import { RunStore } from "../workflows/actions/store";
import { WorkflowJobNode } from '../workflows/actions/workflowJobNode';
import { NoWorkflowJobsNode } from '../workflows/actions/noWorkflowJobsNode';
import { PreviousAttemptsNode } from '../workflows/actions/previousAttemptsNode';
import { AttemptNode } from '../workflows/actions/attemptNode';
import { isInternalCompiler } from './options';
import { isInternalIdInstalled, rootPath } from '../commands/compilation';
import { InternalRunNode } from '../workflows/internal/internalRunNode';
import { InternalRun } from '../workflows/internal/internalRun';
import { InternalJobNode } from '../workflows/internal/internalJobNode';

type CurrentBranchTreeNode =
	| CurrentBranchRepoNode
	| WorkflowRunNode
	| WorkflowJobNode
	| NoWorkflowJobsNode
	| PreviousAttemptsNode
	;

export class CompilationTreeProvider extends WorkflowRunTreeDataProvider
	implements vscode.TreeDataProvider<CurrentBranchTreeNode> {
	
	protected _onDidChangeTreeData = new vscode.EventEmitter<CurrentBranchTreeNode | null>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(
		private readonly context: vscode.ExtensionContext,
		store: RunStore
	) {
		super(store);
	}

	async refresh(): Promise<void> {
		this._onDidChangeTreeData.fire(null);
	}

	async deleteAllEntry(): Promise<void> {
		if (isInternalCompiler(this.context)){
			const folder = rootPath();
			if (!folder || !fs.existsSync(folder+"/.bevara/")){
				return;
			}

			const bevaraFolder = path.join(folder, "/.bevara/");
			const items = fs.readdirSync(bevaraFolder);
			for (const item of items) {
				const fullPath = path.join(bevaraFolder, item);
				if (item.startsWith('.')) {
					continue;
				}
			
				const stats = fs.statSync(fullPath);
				if (stats.isDirectory()) {
					fs.rmSync(fullPath, { recursive: true, force: true });
				}
			}
		}else{
			try {
				const gitHubContext = await getGitHubContext();
				if (!gitHubContext) {
					//log(`Could not find current branch for ${repoContext.name}`);
					return ;
				}

				const repoContext = gitHubContext.repos[0];
				const currentBranch = getCurrentBranch(repoContext.repositoryState);
				if (!currentBranch) {
					//log(`Could not find current branch for ${repoContext.name}`);
					return ;
				}
				// List all workflow runs
				const workflowRunsResponse = await repoContext.client.actions.listWorkflowRunsForRepo({
					owner: repoContext.owner,
					repo: repoContext.name,
					per_page: 100
				});
		
				const workflowRuns = workflowRunsResponse.data.workflow_runs;
		
				console.log(`Found ${workflowRuns.length} workflow runs.`);
		
				// Delete each workflow run
				for (const run of workflowRuns) {
					console.log(`Deleting workflow run with ID: ${run.id}`);
					await repoContext.client.actions.deleteWorkflowRun({
						owner: repoContext.owner,
						repo: repoContext.name,
						run_id: run.id,
					});
					console.log(`Deleted workflow run with ID: ${run.id}`);
				}
		
				console.log("All workflow runs deleted successfully.");
			} catch (error) {
				console.error("Error deleting workflow runs:", error);
			}
		}

		this.refresh();
	}

	getTreeItem(element: CurrentBranchTreeNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
		return element;
	}

	async getGithubChildren(element?: CurrentBranchTreeNode): Promise<CurrentBranchTreeNode[]> {
		if (!element) {
			const gitHubContext = await getGitHubContext();

			if (!gitHubContext) {
				return [];
			}

			if (gitHubContext.repos.length === 1) {
				const repoContext = gitHubContext.repos[0];
				const currentBranch = getCurrentBranch(repoContext.repositoryState);
				if (!currentBranch) {
					//log(`Could not find current branch for ${repoContext.name}`);
					return [];
				}
				return (await this.getActionsRuns(repoContext, currentBranch)) || [];
			}
		} else if (element instanceof WorkflowRunNode) {
			return element.getJobs();
		} else if (element instanceof WorkflowJobNode) {
			return element.getSteps();
		} else if (element instanceof PreviousAttemptsNode) {
			return element.getAttempts();
		} else if (element instanceof AttemptNode) {
			return element.getJobs();
		}

		return Promise.resolve([]);
	}

	async getInternalChildren(element?: CurrentBranchTreeNode): Promise<CurrentBranchTreeNode[]> {
		if (!element) {
			const folder = rootPath();
			if (folder && fs.existsSync(folder+"/.bevara/")){
				return (await this.getInternalRuns(folder+"/.bevara/")) || [];
			}
		} else if (element instanceof InternalRunNode) {
			return element.getJobs();
		}else if (element instanceof InternalJobNode) {
			return element.getSteps();
		}

		return Promise.resolve([]);
	}

	async getChildren(element?: CurrentBranchTreeNode): Promise<CurrentBranchTreeNode[]> {
		if (isInternalCompiler(this.context)){
			return this.getInternalChildren(element);
		}else{
			return this.getGithubChildren(element);
		}
	}

	private async getInternalRuns(folderPath:string): Promise<InternalRunNode[]> {
		const items = fs.readdirSync(folderPath);
		const runs = [];
		items.sort();
		for (const item of items) {
			const fullPath = path.join(folderPath, item);
			if (item.startsWith('.')) {
				continue;
			}
		
			const stats = fs.statSync(fullPath);
			const run = new InternalRun(fullPath, item);
			const installed = isInternalIdInstalled(this.context, fullPath);
			if (stats.isDirectory()) {
				runs.push(new InternalRunNode(fullPath, item, run, installed));
			}
		}
		
		runs.sort((a,b) =>{
			return Number(a.internalName) > Number(b.internalName) ? 1 : Number(a.internalName) < Number(b.internalName) ? -1 : 0;
		});
		
		return runs;
	}

	private async getActionsRuns(gitHubRepoContext: GitHubRepoContext, currentBranchName: string): Promise<WorkflowRunNode[]> {
		// logDebug("Getting workflow runs for branch");
		const result = await gitHubRepoContext.client.actions.listWorkflowRunsForRepo({
			owner: gitHubRepoContext.owner,
			repo: gitHubRepoContext.name,
			branch: currentBranchName,
			per_page: 100
		});

		const resp = result.data;
		const runs = resp.workflow_runs;
		// We are removing newlines from workflow names for presentation purposes
		for (const run of runs) {
			run.name = run.name?.replace(/(\r\n|\n|\r)/gm, " ");
		}

		return this.runNodes(this.context, gitHubRepoContext, runs, true);
	}

	protected _updateNode(node: WorkflowRunNode): void {
		this._onDidChangeTreeData.fire(node);
	}

	toggleInternalCompiler(value: boolean): void {
		this.refresh();
	}
}

export class CurrentBranchRepoNode extends vscode.TreeItem {

	constructor(
		public readonly label: string,
		private readonly version: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly command?: vscode.Command
	) {
		super(label, collapsibleState);

		this.tooltip = `${this.label}-${this.version}`;
		this.description = this.version;
	}

	iconPath = {
		light: path.join(__filename, '..', '..', 'resources', 'light', 'dependency.svg'),
		dark: path.join(__filename, '..', '..', 'resources', 'dark', 'dependency.svg')
	};

	contextValue = 'dependency';
}
