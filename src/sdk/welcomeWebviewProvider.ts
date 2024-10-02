import * as vscode from 'vscode';

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

function getWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
	return {
		// Enable javascript in the webview
		enableScripts: true,

		// And restrict the webview to only loading content from our extension's `media` directory.
		localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
	};
}

/**
 * Manages cat coding webview panels
 */
export class WelcomePanel {
	/**
	 * Track the currently panel. Only allow a single panel to exist at a time.
	 */
	public static currentPanel: WelcomePanel | undefined;

	public static readonly viewType = 'bevaraWelcome';

	private readonly _context: vscode.ExtensionContext;
	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private _disposables: vscode.Disposable[] = [];

	public static createOrShow(context: vscode.ExtensionContext) {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		// If we already have a panel, show it.
		if (WelcomePanel.currentPanel) {
			WelcomePanel.currentPanel._panel.reveal(column);
			return;
		}

		// Otherwise, create a new panel.
		const panel = vscode.window.createWebviewPanel(
			WelcomePanel.viewType,
			'Bevara SDK',
			column || vscode.ViewColumn.One,
			getWebviewOptions(context.extensionUri),
		);

		WelcomePanel.currentPanel = new WelcomePanel(context, panel, context.extensionUri);

		if (vscode.window.registerWebviewPanelSerializer) {
			// Make sure we register a serializer in activation event
			vscode.window.registerWebviewPanelSerializer(WelcomePanel.viewType, {
				async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
					// Reset the webview options so we use latest uri for `localResourceRoots`.
					webviewPanel.webview.options = getWebviewOptions(context.extensionUri);
					WelcomePanel.revive(context, webviewPanel, context.extensionUri);
				}
			});
		}
	}

	public static revive(context: vscode.ExtensionContext, panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		WelcomePanel.currentPanel = new WelcomePanel(context, panel, extensionUri);
	}

	private constructor(context: vscode.ExtensionContext, panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._context = context;
		this._panel = panel;
		this._extensionUri = extensionUri;
		const filter_list: any =

			// Set the webview's initial html content
			this._update();

		// Listen for when the panel is disposed
		// This happens when the user closes the panel or when the panel is closed programmatically
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Update the content based on view changes
		this._panel.onDidChangeViewState(
			e => {
				if (this._panel.visible) {
					this._update();
				}
			},
			null,
			this._disposables
		);

		// Handle messages from the webview
		this._panel.webview.onDidReceiveMessage(
			message => {
				switch (message.type) {
					case 'acceptEULA':
						this.eulaAccepted = true;
						this._update();
						return;
				}
			},
			null,
			this._disposables
		);
	}

	public doRefactor() {
		// Send a message to the webview webview.
		// You can send any JSON serializable data.
		this._panel.webview.postMessage({ command: 'refactor' });
	}

	public dispose() {
		WelcomePanel.currentPanel = undefined;

		// Clean up our resources
		this._panel.dispose();

		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

	private _update() {
		const webview = this._panel.webview;

		if (this.eulaAccepted) {
			this._setInfoView(webview);
		} else {
			this._setEULAView(webview);
		}
	}

	private _setEULAView(webview: vscode.Webview) {
		this._panel.title = 'Bevara EULA';
		this._panel.webview.html = this._getEULAHtmlForWebview(webview);
	}

	private _setInfoView(webview: vscode.Webview) {
		this._panel.title = 'Bevara SDK';
		this._panel.webview.html = this._getWelcomeHtmlForWebview(webview);
	}

	private _getEULAHtmlForWebview(webview: vscode.Webview) {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'eula', 'main.js'));
		const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'css', 'vscode.css'));
		
		// Use a nonce to only allow specific scripts to be run
		const nonce = getNonce();

		return `<!doctype html>
				<html lang="en">
				<head>
					<meta charset="UTF-8">
					<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
					<link href="${styleVSCodeUri}" rel="stylesheet">
					<title>Bevara EULA</title>
				</head>

				<body>
				<h1>Welcome to Bevara SDK</h1>
				<p>Before using the Bevara Open-Source Developer IDE and/or creating or modifying any filters, you must agree to be bound by the <a href="https://bevara.com/terms_of_service/"> Open-Source Developer's EULA</a>. </p> 
				<button class="acceptEULA"> Accept End User Licence Agreement </button> 
				<p> You further agree to be bound by the underlying code licenses as described in LICENSE.</p> 
				
				
				<script nonce="${nonce}" src="${scriptUri}"></script>
				</body>
				</html>`;
	}

	private _getWelcomeHtmlForWebview(webview: vscode.Webview) {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'eula', 'main.js'));
		const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'css', 'vscode.css'));
		
		// Use a nonce to only allow specific scripts to be run
		const nonce = getNonce();

		return `<!doctype html>
				<html lang="en">
				<head>
					<meta charset="UTF-8">
					<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
					<link href="${styleVSCodeUri}" rel="stylesheet">
					<title>Bevara EULA</title>
				</head>

				<body>
				<h1>Welcome to Bevara SDK</h1>
				<p>This panel is shown because ".bevara" is present in the workspace.</p>
				
				
				<script nonce="${nonce}" src="${scriptUri}"></script>
				</body>
				</html>`;
	}

	get eulaAccepted() {
		const bevara_sdk = this._context.globalState.get("bevara_sdk") as any;
		if (!bevara_sdk || bevara_sdk.eula_accepted == null) return false;
		return bevara_sdk.eula_accepted;
	}

	set eulaAccepted(value: boolean) {
		let bevara_sdk = this._context.globalState.get("bevara_sdk") as any;
		if (!bevara_sdk){
			bevara_sdk = {};
		}
		bevara_sdk.eula_accepted = value;
		this._context.globalState.update("bevara_sdk", bevara_sdk);
	}
}