import * as vscode from 'vscode';
import { getCurrentBranch, getGitHubContext, getLastRun, GitHubRepoContext, listArtifacts, registerGitArtifactChangeListener, registerGitRepositoryChangeListener, unregisterGitRepositoryChangeListener } from '../git/repository';
import { Repository } from '../git/vscode.git';
import { Credentials } from '../auth/credentials';
import { BevaraAuthenticationProvider } from '../auth/authProvider';
import { addToLibsActions, getLastArtifactId, getLastInternalId } from '../filters/libraries';
import { isDebugCompiler, isInternalCompiler } from './options';
import { addToLibsInternal, compileProject, compressProject, getCompilationOutputPath, registerInternalArtifactChangeListener, rootPath, saveJSONDesc } from '../commands/compilation';
import { CompilationTreeProvider } from './compilationTreeProvider';

export class ActionsViewProvider implements vscode.WebviewViewProvider {

	public static readonly viewType = "bevara-compiler.actions";
	private _view?: vscode.WebviewView;
	private _repoContext: GitHubRepoContext | null = null;
	private _artifactChangeListenerHandle: NodeJS.Timer | null = null;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly credentials : Credentials,
		private readonly compilationTreeProvider : CompilationTreeProvider
	) {

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
		view.webview.postMessage({ type: 'hideNewArtifacts' });
		view.webview.postMessage({ type: 'hideCompilationInternal' });
		view.webview.postMessage({ type: 'hideChangeBox' });

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
			view.webview.postMessage({
				type: 'showNewArtifacts', body: {
					artifact_id: runId,
					internal_id: null
				}
			});
		}

		await registerGitRepositoryChangeListener(gitChangeCallback);
		
		last_artifact_id = getLastArtifactId(this.context, repoContext);
		const currentBranch = getCurrentBranch(repoContext.repositoryState);
		if (this._artifactChangeListenerHandle) {
			clearInterval(this._artifactChangeListenerHandle);
		}

		const last_run = await getLastRun(repoContext.client, repoContext.name, repoContext.owner, currentBranch);
		if (last_run.length == 0){
			//Never commited, no actions
			view.webview.postMessage({
				type: 'showEmpty', body: {
				}
			});
		}else{
			view.webview.postMessage({
				type: 'hideEmpty', body: {
				}
			});
		}

		this._artifactChangeListenerHandle = await registerGitArtifactChangeListener(repoContext, last_artifact_id, currentBranch, artifactChangeCallback);
	}


	private registerInternal(view: vscode.WebviewView) {
		view.webview.postMessage({ type: 'showCompilationInternal' });
		view.webview.postMessage({ type: 'hideChangeBox' });
		view.webview.postMessage({ type: 'hideNewArtifacts' });
		unregisterGitRepositoryChangeListener();

		if (this._artifactChangeListenerHandle) {
			clearInterval(this._artifactChangeListenerHandle);
		}

		function artifactChangeCallback(runId: number) {
			view.webview.postMessage({
				type: 'showNewArtifacts', body: {
					artifact_id: null,
					internal_id: runId
				}
			});
		}

		const folder = rootPath();
		if (folder == undefined) return;

		const last_artifact_id = getLastInternalId(this.context, folder);

		this._artifactChangeListenerHandle = registerInternalArtifactChangeListener(last_artifact_id, folder, artifactChangeCallback);
	}


	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;
		this.credentials.addWebView(webviewView.webview);


		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,

			localResourceRoots: [
				this.context.extensionUri
			]
		};

		webviewView.webview.onDidReceiveMessage(async (data) => {
			switch (data.type) {
				case 'ready':
					{
						this.credentials.updateInterface();
						this.getGithubRepoContext().then((repoContext) => {
							if (repoContext) {
								this._repoContext = repoContext;
								if (!isInternalCompiler(this.context)) {
									this.registerGithub(webviewView, repoContext);
								}
							}
						});

						if (isInternalCompiler(this.context)) {
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
						if (data.body.artifact_id != null){
							if (!this._repoContext) break;

							unregisterGitRepositoryChangeListener();
							if (this._artifactChangeListenerHandle) {
								clearInterval(this._artifactChangeListenerHandle);
								this._artifactChangeListenerHandle = null;
							}
							await addToLibsActions(this.context, this._repoContext, data.body.artifact_id);
							this.compilationTreeProvider.refresh();
							this.registerGithub(webviewView, this._repoContext);
						}

						if (data.body.internal_id != null){
							const folder = rootPath();
							if (folder == undefined) return;
							if (this._artifactChangeListenerHandle) {
								clearInterval(this._artifactChangeListenerHandle);
								this._artifactChangeListenerHandle = null;
							}
							await addToLibsInternal(this.context, folder, data.body.internal_id);
							this.registerInternal(webviewView);
						}

						webviewView.webview.postMessage({ type: 'hideNewArtifacts' });

						break;
					}
				case 'loginToGithub':
					{
						const octokit = await this.credentials.loginToGithub();
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
						const folder = rootPath();
						if (folder) {
							const output = getCompilationOutputPath(folder);
							const zipBuffer = compressProject(folder);
							compileProject(zipBuffer, folder, output, isDebugCompiler(this.context));
							saveJSONDesc(folder, output);
						}
						break;
					}
			}
		});

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);


	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		// Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'actions', 'main.js'));

		// Do the same for the stylesheet.
		const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'actions', 'reset.css'));
		const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'actions', 'vscode.css'));
		const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'actions', 'main.css'));

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
				<div class="emptyBox">
					<div>
					There are no compilation yet. Save some changes in this code, commit and see how to goes!
					</div>
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
		} else if (this._repoContext) {
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
