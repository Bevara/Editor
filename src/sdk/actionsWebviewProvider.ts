import * as vscode from 'vscode';
import { getCurrentBranch, getGitHubContext, GitHubRepoContext, listArtifacts, registerGitArtifactChangeListener, registerGitRepositoryChangeListener, unregisterGitRepositoryChangeListener } from '../git/repository';
import { Repository } from '../git/vscode.git';
import { Credentials } from '../auth/credentials';
import { BevaraAuthenticationProvider } from '../auth/authProvider';
import { addToLibs, getLastArtifactId } from '../filters/libraries';
import { isInternalCompiler } from './options';
import { compileProject, getCompilationOutputPath, rootPath } from '../commands/compilation';

export class ActionsViewProvider implements vscode.WebviewViewProvider {

	public static readonly viewType = "bevara-compiler.actions";
	private _view?: vscode.WebviewView;
	private readonly _context: vscode.ExtensionContext;
	private _repoContext: GitHubRepoContext | null = null;
	private _credentials = new Credentials();
	private _registerGitRepositoryChangeListenerHandle: NodeJS.Timer | null = null;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly _bevaraAuthenticationProvider: BevaraAuthenticationProvider
	) {
		this._context = context;

	}

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

	private async registerGithub(view: vscode.WebviewView, repoContext: GitHubRepoContext) {
		let last_artifact_id: number | null = null;

		function gitChangeCallback(repository: Repository) {
			const changes = repository.state.workingTreeChanges;

			if (changes.length > 0) {
				view.webview.postMessage({ type: 'showChangeBox' });
			} else {
				view.webview.postMessage({ type: 'hideChangeBox' });
			}
		}




		function artifactChangeCallback(runId: number) {
			view.webview.postMessage({ type: 'showNewArtifacts', body: runId });
		}

		registerGitRepositoryChangeListener(gitChangeCallback);


		last_artifact_id = getLastArtifactId(this._context, repoContext);

		const currentBranch = getCurrentBranch(repoContext.repositoryState);
		this._registerGitRepositoryChangeListenerHandle = await registerGitArtifactChangeListener(repoContext, last_artifact_id, currentBranch, artifactChangeCallback);


		view.webview.postMessage({ type: 'hideCompilationInternal' });
	}


	private registerInternal(view: vscode.WebviewView) {
		view.webview.postMessage({ type: 'showCompilationInternal' });
		view.webview.postMessage({ type: 'hideChangeBox' });
		view.webview.postMessage({ type: 'hideNewArtifacts' });
		unregisterGitRepositoryChangeListener();

		if (this._registerGitRepositoryChangeListenerHandle) {
			clearInterval(this._registerGitRepositoryChangeListenerHandle);
			this._registerGitRepositoryChangeListenerHandle = null;
		}


	}


	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;


		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,

			localResourceRoots: [
				this._context.extensionUri
			]
		};

		webviewView.webview.onDidReceiveMessage(async (data) => {
			switch (data.type) {
				case 'ready':
					{
						this._credentials.initialize(this._context, this._bevaraAuthenticationProvider, webviewView.webview);
						
						this.getGithubRepoContext().then((repoContext) => {
							if (repoContext) {
								this._repoContext = repoContext;
								if (!isInternalCompiler(this._context)){
									this.registerGithub(webviewView, repoContext);
								}
							}
						});
						
						if (isInternalCompiler(this._context)){
							this.registerInternal(webviewView);
						}
							
						break;
					}
				case 'showGitSCM':
					{
						vscode.commands.executeCommand('workbench.view.scm');
						break;
					}
				case 'updateArtifact':
					{
						if (!this._repoContext) break;
						
						unregisterGitRepositoryChangeListener();
						if (this._registerGitRepositoryChangeListenerHandle) {
							clearInterval(this._registerGitRepositoryChangeListenerHandle);
							this._registerGitRepositoryChangeListenerHandle = null;
						}
						await addToLibs(this._context, this._repoContext, data.body);
						webviewView.webview.postMessage({ type: 'hideNewArtifacts' });
						this.registerGithub(webviewView, this._repoContext);
						break;
					}
				case 'loginToGithub':
					{
						const octokit = await this._credentials.loginToGithub();
						const userInfo = await octokit.users.getAuthenticated();
						vscode.window.showInformationMessage(`Logged into GitHub as ${userInfo.data.login}`);
						break;
					}
				case 'loginToBevara':
					{
						vscode.authentication.getSession(BevaraAuthenticationProvider.id, [], { createIfNone: true });
						break;
					}
				case 'launchInternalCompilation':
					{
						const path = rootPath();
						if (path){
							const output = getCompilationOutputPath(path);
							compileProject(path, output);
						}
						break;
					}
			}
		});

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);


	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		// Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'actions', 'main.js'));

		// Do the same for the stylesheet.
		const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'actions', 'reset.css'));
		const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'actions', 'vscode.css'));
		const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'actions', 'main.css'));

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
				<div class="authBevaraBox">
					<div>
					You are not logged to Bevara:
					</div>
					<button class="auth-bevara">Sign in to Bevara</button>
				</div>
				<div class="authGithubBox">
					<div>
					You are not logged to Github:
					</div>
					<button class="auth-github">Sign in to Github</button>
				</div>
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
				<div class="internalCompileBox">
					<div>
					You are using the optimized compiler :
					</div>
					<button class="launch-compilation">Start compilation</button>
				</div>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
	}

	toggleInternalCompiler(value: boolean): void {
		if (this._view == undefined) return;

		if (value == true) {
			this.registerInternal(this._view);
		} else if (this._repoContext){
			this.registerGithub(this._view, this._repoContext);
		}
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
