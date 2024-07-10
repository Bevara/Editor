import {
	authentication,
	AuthenticationProvider,
	AuthenticationProviderAuthenticationSessionsChangeEvent,
	AuthenticationSession,
	Disposable,
	Event,
	EventEmitter,
	SecretStorage,
	window,
} from 'vscode';

class BevaraSession implements AuthenticationSession {
	// We don't know the user's account name, so we'll just use a constant
	readonly account = { id: BevaraAuthenticationProvider.id, label: 'Bevara Access Token' };
	
	// This id isn't used for anything in this example, so we set it to a constant
	readonly id = BevaraAuthenticationProvider.id;

	// We don't know what scopes the PAT has, so we have an empty array here.
	readonly scopes = [];

	/**
	 * 
	 * @param accessToken The personal access token to use for authentication
	 */
	constructor(public readonly accessToken: string) { }
}


export class BevaraAuthenticationProvider implements AuthenticationProvider, Disposable {
	static id = 'bevaraSessionToken';
	private static secretKey = 'Bevara_Session_Token';

	private _onDidChangeSessions = new EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent>();
	private initializedDisposable: Disposable | undefined;
	private currentToken: Promise<string | undefined> | undefined;

	private ensureInitialized(): void {
		if (this.initializedDisposable === undefined) {
			void this.cacheTokenFromStorage();

			this.initializedDisposable = Disposable.from(
				// This onDidChange event happens when the secret storage changes in _any window_ since
				// secrets are shared across all open windows.
				this.secretStorage.onDidChange(e => {
					if (e.key === BevaraAuthenticationProvider.secretKey) {
						void this.checkForUpdates();
					}
				}),
				// This fires when the user initiates a "silent" auth flow via the Accounts menu.
				authentication.onDidChangeSessions(e => {
					if (e.provider.id === BevaraAuthenticationProvider.id) {
						void this.checkForUpdates();
					}
				}),
			);
		}
	}

	private async checkForUpdates(): Promise<void> {
		const added: AuthenticationSession[] = [];
		const removed: AuthenticationSession[] = [];
		const changed: AuthenticationSession[] = [];

		const previousToken = await this.currentToken;
		const session = (await this.getSessions())[0];

		if (session?.accessToken && !previousToken) {
			added.push(session);
		} else if (!session?.accessToken && previousToken) {
			removed.push(session);
		} else if (session?.accessToken !== previousToken) {
			changed.push(session);
		} else {
			return;
		}

		void this.cacheTokenFromStorage();
		this._onDidChangeSessions.fire({ added: added, removed: removed, changed: changed });
	}

	private cacheTokenFromStorage() {
		this.currentToken = this.secretStorage.get(BevaraAuthenticationProvider.secretKey) as Promise<string | undefined>;
		return this.currentToken;
	}


	constructor(private readonly secretStorage: SecretStorage) { }

	dispose() {
		this.initializedDisposable?.dispose();
	}
	
	get onDidChangeSessions(): Event<AuthenticationProviderAuthenticationSessionsChangeEvent> {
		return this._onDidChangeSessions.event;
	}

	async getSessions(scopes?: readonly string[]): Promise<readonly AuthenticationSession[]> {
		this.ensureInitialized();
		const token = await this.cacheTokenFromStorage();
		return token ? [new BevaraSession(token)] : [];
	}

	async createSession(scopes: readonly string[]): Promise<AuthenticationSession> {
		this.ensureInitialized();

		// Prompt for the PAT.
		const token = await window.showInputBox({
			ignoreFocusOut: true,
			placeHolder: 'Personal access token',
			prompt: 'Enter an Azure DevOps Personal Access Token (PAT).',
			password: true,
		});

		// Note: this example doesn't do any validation of the token beyond making sure it's not empty.
		if (!token) {
			throw new Error('PAT is required');
		}

		// Don't set `currentToken` here, since we want to fire the proper events in the `checkForUpdates` call
		await this.secretStorage.store(BevaraAuthenticationProvider.secretKey, token);
		console.log('Successfully logged in to Azure DevOps');

		return new BevaraSession(token);
	}
	removeSession(sessionId: string): Thenable<void> {
		throw new Error('Method not implemented.');
	}


}