import * as vscode from 'vscode';
import * as Octokit from '@octokit/rest';
import * as path from 'path';
import { BevaraAuthenticationProvider } from '../auth/authProvider';
import { GitExtension, API as ScmGitApi } from '../git/vscode.git';

const GITHUB_AUTH_PROVIDER_ID = 'github';

// The GitHub Authentication Provider accepts the scopes described here:
// https://developer.github.com/apps/building-oauth-apps/understanding-scopes-for-oauth-apps/
const SCOPES = ['user:email', 'repo', 'read:actions'];

export class Credentials {
	public octokit: Octokit.Octokit = new Octokit.Octokit();
	private _webviews: vscode.Webview[] = [];
	private _eventEmitters: vscode.EventEmitter<any>[] = [];
	private _bevaraAuthenticationProvider: BevaraAuthenticationProvider | null = null;
	private _githubUserInfo: any = null;
	private _bevaraUserInfo: any = null;
	private _gitExt: ScmGitApi | undefined = undefined;
	private _gitHubSession : vscode.AuthenticationSession | undefined = undefined;

	async initialize(context: vscode.ExtensionContext,
		bevaraAuthenticationProvider: BevaraAuthenticationProvider): Promise<void> {

		this._bevaraAuthenticationProvider = bevaraAuthenticationProvider;

		this.registerListeners(context);
		await this.setOctokit();
		await this.setBevaraAuth();
		await this.getBuiltInGitApi();
		await this.updateInterface();
	}

	private async setOctokit() {
		/**
		 * By passing the `createIfNone` flag, a numbered badge will show up on the accounts activity bar icon.
		 * An entry for the sample extension will be added under the menu to sign in. This allows quietly 
		 * prompting the user to sign in.
		 * */
		this._gitHubSession = await vscode.authentication.getSession(GITHUB_AUTH_PROVIDER_ID, SCOPES, { createIfNone: false });

		if (this._gitHubSession) {
			this.octokit = new Octokit.Octokit({
				auth: this._gitHubSession.accessToken
			});

			const octokit = await this.loginToGithub();
			const userInfo = await octokit.users.getAuthenticated();
			this._githubUserInfo = userInfo.data;

			return true;
		}

		return false;
	}

	private async setBevaraAuth() {
		const session = await vscode.authentication.getSession(BevaraAuthenticationProvider.id, [], { createIfNone: false });
		if (session && this._bevaraAuthenticationProvider) {
			this._bevaraUserInfo = await this._bevaraAuthenticationProvider.info(session.accessToken);
			return true;
		}

		this._bevaraUserInfo = null;
		return false;
	}

	public async updateInterface() {
		this.postMessage('updateProfile', {
			account: this._bevaraUserInfo,
			github: this._githubUserInfo,
			hasGit: this._gitExt != undefined ? true : false
		});

		for (const eventEmitters of this._eventEmitters){
			eventEmitters.fire(null);
		}

		return false;
	}

	async getBuiltInGitApi(): Promise<ScmGitApi | undefined> {
		try {
			const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
			if (extension == null) return undefined;

			const gitExtension = extension.isActive ? extension.exports : await extension.activate();
			this._gitExt = gitExtension?.getAPI(1);
		} catch {
			return undefined;
		}
	}

	registerListeners(context: vscode.ExtensionContext): void {
		/**
		 * Sessions are changed when a user logs in or logs out.
		 */
		context.subscriptions.push(vscode.authentication.onDidChangeSessions(async e => {
			if (e.provider.id === GITHUB_AUTH_PROVIDER_ID) {
				await this.setOctokit();
			} else if (e.provider.id === BevaraAuthenticationProvider.id) {
				await this.setBevaraAuth();
			}

			this.updateInterface();
		}));
	}

	async loginToGithub(): Promise<Octokit.Octokit> {
		/**
		 * When the `createIfNone` flag is passed, a modal dialog will be shown asking the user to sign in.
		 * Note that this can throw if the user clicks cancel.
		 */
		const session = await vscode.authentication.getSession(GITHUB_AUTH_PROVIDER_ID, SCOPES, { createIfNone: true });
		this.octokit = new Octokit.Octokit({
			auth: session.accessToken
		});

		return this.octokit;
	}

	async forceNewLoginToGithub(): Promise<Octokit.Octokit> {
		const session = await vscode.authentication.getSession(GITHUB_AUTH_PROVIDER_ID, SCOPES, { forceNewSession: true });
		this.octokit = new Octokit.Octokit({
			auth: session.accessToken
		});

		return this.octokit;
	}

	private postMessage(type: string, body: any): void {
		for (const webview of this._webviews) {
			webview.postMessage({ type, body });
		}
	}

	public addWebView( webview : vscode.Webview){
		this._webviews.push(webview);
	}

	public addEventEmitter( eventEmitter : vscode.EventEmitter<any>){
		this._eventEmitters.push(eventEmitter);
	}


	async cloneRepository(repository: any) {

		if (this._gitExt == undefined || repository == null) {
			return;
		}
		try {

			const destinationUri = await vscode.window.showOpenDialog({
				canSelectFolders: true,
				canSelectFiles: false,
				canSelectMany: false,
				openLabel: 'Select a folder to store the filter source locally',
			});

			if (!destinationUri || destinationUri.length === 0) {
				vscode.window.showErrorMessage('No folder selected');
				return;
			}

			const localPath = destinationUri[0].fsPath;
			await vscode.commands.executeCommand('git.clone', repository.clone_url, localPath);

			console.log(`Repository cloned to ${localPath}`);
			return localPath;
		} catch (error: any) {
			console.error('Error cloning the repository:', error.message);
		}
	}

	async forkExistingFilter(name: string, owner: string, repo: string) {
		try {
			const response = await this.octokit.repos.createFork({
				owner: owner,  // Replace with the owner of the repository you want to fork
				repo: repo,           // Replace with the repository name you want to fork
				name: name
			});


			console.log('Repository forked successfully:', response.data);

			/*const new_owner = response.data.owner.login;
			await this.octokit.request('PUT /repos/{owner}/{repo}/actions/permissions', {
				owner: new_owner,
				repo: name,
				enabled: true
			});

			console.log(`GitHub Actions enabled for ${owner}/${repo}`);*/

			return response.data;
		} catch (error) {
			console.error('Error forking the repository:', error);
			return null;
		}
	}

	// Function to check if a repository exists
	async checkIfRepoExists(owner: string, repo: string) {
		try {
			const response = await this.octokit.rest.repos.get({
				owner: owner,
				repo: repo,
			});
			console.log("Repository exists:", response.data.full_name);
			return true;
		} catch (error: any) {
			if (error.status === 404) {
				console.log("Repository does not exist.");
				return false;
			} else {
				console.error("An error occurred:", error);
				throw error;
			}
		}
	}

	async getDescFromRepo(owner: string, repo: string, branch?: string) {
		const response = await this.octokit.repos.getContent({
			owner: owner,
			repo: repo,
			path: repo + ".json",
			ref: branch, // Optional, default is the repository’s default branch (usually main)
		});

		// The content is base64 encoded, so you need to decode it
		const content = Buffer.from((response.data as any).content, 'base64').toString('utf8');

		// Parse the content as JSON
		return JSON.parse(content);
	}

	async getAllReleaseTags(owner: string, repo: string) {
		const releasesResponse = await this.octokit.repos.listReleases({
			owner: owner,
			repo: repo
		});

		return releasesResponse.data;
	}

	async parseReleaseAssets(owner: string, repo: string, data: any, imported: boolean) {
		const source = data.zipball_url;
		const binaries = data.assets.filter((x: any) => x.content_type == 'application/wasm');
		const descs = data.assets.filter((x: any) => x.content_type == 'application/json');
		const filters: any = {};
		for (const binary of binaries) {
			const name = path.parse(binary.name).name;
			const desc = descs.find((x: any) => path.parse(x.name).name == name);
			const filter_desc = await this.octokit.repos.getReleaseAsset({
				owner: owner,
				repo: repo,
				asset_id: desc.id,
				headers: {
					accept: "application/octet-stream", // GitHub's API requires this header to download binary data
				},
			}
			);

			const content = Buffer.from((filter_desc.data as any), 'base64').toString('utf8');
			const jsonData = JSON.parse(content);
			jsonData.sources = source;
			jsonData.binaries = binary.id;
			jsonData.owner = owner;
			jsonData.repo = repo;
			jsonData.imported = imported;
			jsonData.isDev = false;
			filters[binary.name] = jsonData;
		}
		return filters;
	}

	async getLastCommitHash(owner: string, repo: string) {
		try {
			const { data } = await this.octokit.repos.listCommits({
				owner: owner,
				repo: repo,
				per_page: 1,
			});

			const lastCommitHash = data[0].sha;
			console.log(`Last commit hash: ${lastCommitHash}`);

			return lastCommitHash;
		} catch (error) {
			console.error('Error fetching the last commit:', error);
		}
	}

	// Function to create a new repository
	async createRepo(repoName: string, description: string) {
		try {
			const response = await this.octokit.rest.repos.createForAuthenticatedUser({
				name: repoName,        // Name of the new repository
				description: description, // Description of the repository (optional)
				private: false,        // Set to true if you want the repo to be private
			});

			console.log("Repository created:", response.data.full_name);
			return response.data;
		} catch (error) {
			console.error("An error occurred while creating the repository:", error);
			throw error;
		}
	}


	async downloadRepoArchive(owner: string, repo: string, ref: string) {
		const response = await this.octokit.repos.downloadZipballArchive({
			owner: owner,
			repo: repo,
			ref: ref, // The branch or tag you want to download
		});

		const downloadUrl = response.url;
		return downloadUrl;
	}

	async checkIfForkExists(owner: string, repo: string, username: string) {
		try {
			// Fetch all forks of the repository
			const forks = await this.octokit.rest.repos.listForks({
				owner: owner,
				repo: repo
			});

			// Check if any fork belongs to the specified user
			return forks.data.some(fork => fork.owner.login === username);
		} catch (error) {
			console.error('Error checking fork:', error);
			return false;
		}
	}

	async getWorkflow(owner: string, repo: string, workflow_id: string) {
		try {
			const workflow = await this.octokit.actions.getWorkflow({
				owner,
				repo,
				workflow_id,
			});
			console.log(workflow.data);
		} catch (error) {
			console.error(`Error retrieving workflow: ${error}`);
		}
	}

	async getGitHubSession(){
		if (!this._gitHubSession){
			await this.setOctokit();
		}
		return this._gitHubSession;
	}

	get isPayedUser(){
		if (!this._bevaraUserInfo || ! ("roles" in this._bevaraUserInfo)){
			return false;
		}
		const role_paying_user = this._bevaraUserInfo["roles"].filter((x:any) => x.name == "role_paying_user");

		return role_paying_user.length >0;
	}
}