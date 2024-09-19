import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Credentials } from '../auth/credentials';
import { getCurrentBranch, getGitHubContext, GitHubRepoContext } from '../git/repository';
import { WorkflowRunNode } from '../workflows/workflowRunNode';
import { WorkflowRunTreeDataProvider } from '../workflows/workflowRunTreeDataProvider';
import {RunStore} from "./../workflows/store";

type CurrentBranchTreeNode =
  | CurrentBranchRepoNode
  | WorkflowRunNode;

export class CompilationTreeProvider extends WorkflowRunTreeDataProvider
	implements vscode.TreeDataProvider<CurrentBranchTreeNode> {

	private _onDidChangeTreeData: vscode.EventEmitter<CurrentBranchRepoNode | undefined | void> = new vscode.EventEmitter<CurrentBranchRepoNode | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<CurrentBranchRepoNode | undefined | void> = this._onDidChangeTreeData.event;
	private _credentials = new Credentials();

	constructor(store: RunStore
	) {
		super(store);
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: CurrentBranchRepoNode): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: CurrentBranchTreeNode): Promise<CurrentBranchTreeNode[]> {

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
				return (await this.getRuns(repoContext, currentBranch)) || [];

			}
		}
		return Promise.resolve([]);
	}

	private async getRuns(gitHubRepoContext: GitHubRepoContext, currentBranchName: string): Promise<WorkflowRunNode[]> {
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

		return this.runNodes(gitHubRepoContext, runs, true);
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
