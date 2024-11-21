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
	ExtensionContext,
	env,
	Uri
} from 'vscode';
import * as https from 'https';
import { config } from '../util';



export class BevaraSession implements AuthenticationSession {
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
	private state: string | null = null;

	constructor(
		private readonly context: ExtensionContext,
		private readonly secretStorage: SecretStorage) {
	}
	


	async info(accessToken:string){
		return new Promise((resolve, reject) => {
			https.get(`${config.serverUrl.trim()}/api/getUserInfo?token=${accessToken}`, (res) => {
				if (res.statusCode == 200) {
					let data = '';

					// A chunk of data has been received.
					res.on('data', (chunk) => {
						data += chunk;
					});

					// The whole response has been received.
					res.on('end', () => {
						try {
							// Parse JSON data
							const jsonData = JSON.parse(data);
							resolve(jsonData);
						} catch (e) {
							reject(e);
						}
					});
				} else {
					reject(`Failed to authentification to server. Status code: ${res.statusCode}`);
				}
			});
		});
		return "string";
	}


	private ensureInitialized(): void {
		//this.removeSession("");
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

	getOrSaveState() {
		if (this.state !== null) {
			return this.state;
		}
		else {
			this.state = Math.random().toString(36).slice(2);
			return this.state;
		}
	}

	clear() {
		this.secretStorage.delete(BevaraAuthenticationProvider.secretKey);
	}

	getSigninUrl() {
		const redirectUri = config.redirectPath;
		const scope = "read";
		const state = this.getOrSaveState();
		return `${config.casdoorUrl.trim()}/login/oauth/authorize?client_id=${config.clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}`;
	}

	async getCasDoorCode(state:string): Promise<string | undefined> {
		return new Promise((resolve, reject) => {
			function parseQuery(queryString: string): { [key: string]: string } {
				const query: { [key: string]: string } = {};
				const pairs = queryString.split('&');
				for (const pair of pairs) {
					const [key, value] = pair.split('=');
					if (key) {
						query[decodeURIComponent(key)] = decodeURIComponent(value || '');
					}
				}
				return query;
			}

			const handlerDisposable = window.registerUriHandler({
				handleUri(uri: Uri) {
					handlerDisposable.dispose();
					const keys = parseQuery(uri.query);
					if (keys.state != state) reject('Wrong state is given');
					resolve(uri.query);
				}
			});
			this.context.subscriptions.push(handlerDisposable);
		});
	}

	async getOauthToken(uri: string): Promise<string | undefined> {
		return new Promise((resolve, reject) => {
			https.get(uri, (res) => {
				if (res.statusCode == 200) {
					let data = '';

					// A chunk of data has been received.
					res.on('data', (chunk) => {
						data += chunk;
					});

					// The whole response has been received.
					res.on('end', () => {
						try {
							// Parse JSON data
							const jsonData = JSON.parse(data);
							resolve(jsonData.token);
						} catch (e) {
							reject(e);
						}
					});
				} else {
					reject(`Failed to authentification to server. Status code: ${res.statusCode}`);
				}
			});
		});
	}

	async createSession(scopes: readonly string[]): Promise<AuthenticationSession> {

		
		this.ensureInitialized();
		const secretStorage = this.secretStorage;
		env.openExternal(Uri.parse(this.getSigninUrl()));
		const query = await this.getCasDoorCode(this.getOrSaveState());
		const token = await this.getOauthToken(`${config.serverUrl.trim()}/api/signin?${query}`);

		if (!token) {
			throw new Error('Authentification is required');
		}

		await secretStorage.store(BevaraAuthenticationProvider.secretKey, token);
		console.log('Successfully logged in to Bevara');

		return new BevaraSession(token);

	}

	async removeSession(sessionId: string): Promise<void> {
		const token = await this.currentToken;
		if (!token) {
			return;
		}
		await this.secretStorage.delete(BevaraAuthenticationProvider.secretKey);
		this._onDidChangeSessions.fire({
			removed: [new BevaraSession(token)],
			added: undefined,
			changed: undefined
		});
	}
}