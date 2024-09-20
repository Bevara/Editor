import * as vscode from 'vscode';
import * as path from 'path';
import { getCurrentBranch, getGitHubContext, GitHubRepoContext } from '../git/repository';
import { WorkflowRunNode } from '../workflows/workflowRunNode';
import { WorkflowRunTreeDataProvider } from '../workflows/workflowRunTreeDataProvider';
import {RunStore} from "./../workflows/store";
import { WorkflowJobNode } from '../workflows/workflowJobNode';
import { NoWorkflowJobsNode } from '../workflows/noWorkflowJobsNode';
import { PreviousAttemptsNode } from '../workflows/previousAttemptsNode';
import { AttemptNode } from '../workflows/attemptNode';

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

	constructor(store: RunStore
	) {
		super(store);
	}

	async refresh(): Promise<void> {
		this._onDidChangeTreeData.fire(null);
	}

	getTreeItem(element: CurrentBranchTreeNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
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
		}else if (element instanceof WorkflowRunNode) {
			return element.getJobs();
		}else if (element instanceof WorkflowJobNode) {
			return element.getSteps();
		}else if (element instanceof PreviousAttemptsNode) {
			return element.getAttempts();
		}else if (element instanceof AttemptNode) {
			return element.getJobs();
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

	protected _updateNode(node: WorkflowRunNode): void {
		this._onDidChangeTreeData.fire(node);
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
