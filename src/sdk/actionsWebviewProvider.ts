import * as vscode from 'vscode';
import { getArtifact, getCurrentBranch, getGitHubContext, listArtifacts, registerGitArtifactChangeListener, registerGitRepositoryChangeListener } from '../git/repository';
import { Repository } from '../git/vscode.git';

export class ActionsViewProvider implements vscode.WebviewViewProvider {

	public static readonly viewType = "bevara-compiler.actions";

	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
	) { }

	async getGithubRepoContext() {
		const gitHubContext = await getGitHubContext();

		if (!gitHubContext) {
			return null;
		}

		if (gitHubContext.repos.length === 1) {
			const repoContext = gitHubContext.repos[0];
			const currentBranch = getCurrentBranch(repoContext.repositoryState);
			if (!currentBranch) {
				//log(`Could not find current branch for ${repoContext.name}`);
				return null;
			}
			return repoContext;
		}
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		const view = webviewView;

		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,

			localResourceRoots: [
				this._extensionUri
			]
		};

		function gitChangeCallback(repository: Repository) {
			const changes = repository.state.workingTreeChanges;

			if (changes.length > 0) {
				view.webview.postMessage({ type: 'showChangeBox' });
			} else {
				view.webview.postMessage({ type: 'hideChangeBox' });
			}
		}

		registerGitRepositoryChangeListener(gitChangeCallback);

		this.getGithubRepoContext().then(repoContext => {
			let last_artifact_id = 0;
			if (!repoContext) return;

			const currentBranch = getCurrentBranch(repoContext.repositoryState);

			function artifactChangeCallback(handle: NodeJS.Timer, runId: number) {
				clearInterval(handle);
				if (!repoContext) return;
				last_artifact_id = runId;
				view.webview.postMessage({ type: 'showNewArtifacts' });
				registerGitArtifactChangeListener(repoContext, runId, currentBranch, artifactChangeCallback);
			}

			registerGitArtifactChangeListener(repoContext, 0, currentBranch, artifactChangeCallback);

			webviewView.webview.onDidReceiveMessage(async (data) => {
				switch (data.type) {
					case 'showGitSCM':
						{
							vscode.commands.executeCommand('workbench.view.scm');
							break;
						}
					case 'updateArtifact':
						{
							if (last_artifact_id == 0) break;
							const artifacts = await listArtifacts(repoContext, last_artifact_id);
							if (artifacts.length != 1){
								break;
							}
							const buffer = await getArtifact(repoContext, artifacts[0].id);

							break;
						}
				}
			});
		});

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);


	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		// Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'actions', 'main.js'));

		// Do the same for the stylesheet.
		const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'actions', 'reset.css'));
		const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'actions', 'vscode.css'));
		const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'actions', 'main.css'));

		// Use a nonce to only allow a specific script to be run.
		const nonce = getNonce();

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<!--
					Use a content security policy to only allow loading styles from our extension directory,
					and only allow scripts that have a specific nonce.
					(See the 'webview-sample' extension sample for img-src content security policy examples)
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

				<meta name="viewport" content="width=device-width, initial-scale=1.0">

				<link href="${styleResetUri}" rel="stylesheet">
				<link href="${styleVSCodeUri}" rel="stylesheet">
				<link href="${styleMainUri}" rel="stylesheet">
			</head>
			<body>
				<div class="changeBox">
					<div>
					There are changes that can be committed on the given filter :
					</div>
					<button class="commit-and-push">Commit and push changes</button>
				</div>
				<div class="newArtifactsBox">
					<div>
					A new version of the filter is available :
					</div>
					<button class="updateArtifact">Add latest filter version to Bevara library</button>
				</div>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
	}
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
