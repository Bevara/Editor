import * as vscode from 'vscode';
import { isEulaAccepted, setEulaAccepted, setshowPopUp, showPopUp } from './options';
import { getCurrentBranch, getGitHubContext } from '../git/repository';

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

	public static createOrShow(context: vscode.ExtensionContext) {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		// If we already have a panel, show it.
		if (WelcomePanel.currentPanel) {
			WelcomePanel.currentPanel._panel.reveal(column);
			return;
		}

		if (showPopUp(context) == false) {
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
						vscode.commands.executeCommand('setContext', 'showSDK', true);
						setEulaAccepted(this._context, true);
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

		if (isEulaAccepted(this._context)) {
			vscode.window
				.showInformationMessage("Do you want to show this panel next time ?", "Yes", "No")
				.then(answer => {
					if (answer === "No") {
						setshowPopUp(this._context, false);
					}
				});
		}
	}

	private _update() {
		const webview = this._panel.webview;

		if (isEulaAccepted(this._context)) {
			this._setInfoView(webview);
		} else {
			this._setEULAView(webview);
		}
	}

	private _setEULAView(webview: vscode.Webview) {
		this._panel.title = 'Bevara EULA';
		this._panel.webview.html = this._getEULAHtmlForWebview(webview);
	}

	private async _setInfoView(webview: vscode.Webview) {
		this._panel.title = 'Bevara Open-Source Developer IDE';
		this._panel.webview.html = await this._getWelcomeHtmlForWebview(webview);
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
				<p>Before using the Bevara Open-Source Developer IDE and/or creating or modifying any filters, you must agree to be bound by the <a href="https://bevara.com/terms-of-service-bevara-open-source-developer-ide/"> Open-Source Developer's EULA</a>. </p> 
				<button class="acceptEULA"> Accept End User Licence Agreement </button> 
				<p> You further agree to be bound by the underlying code licenses as described in LICENSE.</p> 
				
				
				<script nonce="${nonce}" src="${scriptUri}"></script>
				</body>
				</html>`;
	}

	private async _getWelcomeHtmlForWebview(webview: vscode.Webview) {
		const gitHubContext = await getGitHubContext();
		let repoContext = {} as any;
		if (gitHubContext && gitHubContext.repos.length > 0) {
			repoContext = gitHubContext.repos[0];
		}

		const fusionStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'css', 'fusion-styles.css'));
		const menuGifPath = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'welcome', 'menu.gif'));
		const actionsGifPath = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'welcome', 'github_actions.gif'));
		const commitGifPath = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'welcome', 'commit.gif'));
		const compilerPngPath = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'welcome', 'compiler.png'));
		const addFilterGifPath = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'welcome', 'add_filter.gif'));
		const newLibGifPath = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'welcome', 'new_lib.gif'));


		// Use a nonce to only allow specific scripts to be run
		const nonce = getNonce();

		return `<!doctype html>
				<html lang="en">
				<head>
					<meta charset="UTF-8">
					<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'self' 'unsafe-inline'; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
					<link href="${fusionStyleUri}" rel="stylesheet">
					<title>Bevara EULA</title>
				</head>

				<body>
			<div class="fusion-layout-column" style="--awb-padding-top:20px;--awb-padding-right:40px;--awb-padding-bottom:20px;--awb-padding-left:40px;--awb-bg-size:cover;--awb-margin-top-large:20px;--awb-spacing-right-large:3.84%;--awb-margin-bottom-large:20px;--awb-spacing-left-large:3.84%;--awb-width-medium:100%;--awb-order-medium:0;--awb-spacing-right-medium:1.92%;--awb-spacing-left-medium:1.92%;--awb-width-small:100%;--awb-order-small:0;--awb-spacing-right-small:1.92%;--awb-spacing-left-small:1.92%;">
				<div class="fusion-column-wrapper fusion-column-has-shadow fusion-flex-justify-content-flex-start fusion-content-layout-column">
					<div class="fusion-text fusion-text-11" style="--awb-font-size:var(--awb-typography1-font-size);--awb-line-height:var(--awb-typography1-line-height);--awb-letter-spacing:var(--awb-typography1-letter-spacing);--awb-text-transform:var(--awb-typography1-text-transform);--awb-text-color:var(--awb-color8);--awb-text-font-family:var(--awb-typography1-font-family);--awb-text-font-weight:var(--awb-typography1-font-weight);--awb-text-font-style:var(--awb-typography1-font-style);">
						<h2 style="text-align: center;">
							<span style="color: #3574ba;">Bevara Open-Source Developer IDE</span>
						</h2>
					</div>
					<div class="fusion-text fusion-text-12" style="--awb-font-size:var(--awb-typography1-font-size);--awb-line-height:var(--awb-typography1-line-height);--awb-letter-spacing:var(--awb-typography1-letter-spacing);--awb-text-transform:var(--awb-typography1-text-transform);--awb-text-color:var(--awb-custom10);--awb-text-font-family:var(--awb-typography1-font-family);--awb-text-font-weight:var(--awb-typography1-font-weight);--awb-text-font-style:var(--awb-typography1-font-style);">
						<h4 style="text-align: center;">
							<span style="color: #3574ba;">A tool for open-source developers.</span>
						</h4>
					</div>
					<div class="fusion-text fusion-text-13">
						<h6>The Bevara Open-Source Developer IDE provides many of the Bevara Access Premium tools free to developers who wish to contribute open-source Accessors to the Bevara project. This is appropriate for those who are developing new open-source formats that they would like to be easily supportable in browsers or who are working to keep legacy open-source formats alive.</h6>
					</div>
				</div>
			</div>
		
		
	<div class="fusion-fullwidth fullwidth-box fusion-builder-row-4 fusion-flex-container has-pattern-background has-mask-background nonhundred-percent-fullwidth non-hundred-percent-height-scrolling"
	style="--awb-border-radius-top-left:0px;--awb-border-radius-top-right:0px;--awb-border-radius-bottom-right:0px;--awb-border-radius-bottom-left:0px;--awb-padding-right:20px;--awb-padding-left:20px;--awb-margin-top:20px;--awb-margin-bottom:20px;--awb-background-color:var(--awb-color1);--awb-flex-wrap:wrap;">
	<div class="fusion-builder-row fusion-row fusion-flex-align-items-flex-start fusion-flex-content-wrap"
		style="max-width:104%;margin-left: calc(-4% / 2 );margin-right: calc(-4% / 2 );">
		<div class="fusion-layout-column fusion_builder_column fusion-builder-column-6 fusion_builder_column_1_3 1_3 fusion-flex-column"
			style="--awb-padding-top:20px;--awb-padding-bottom:20px;--awb-padding-left:20px;--awb-bg-size:cover;--awb-width-large:33.333333333333%;--awb-margin-top-large:20px;--awb-spacing-right-large:5.76%;--awb-margin-bottom-large:20px;--awb-spacing-left-large:5.76%;--awb-width-medium:100%;--awb-order-medium:0;--awb-spacing-right-medium:1.92%;--awb-spacing-left-medium:1.92%;--awb-width-small:100%;--awb-order-small:0;--awb-spacing-right-small:1.92%;--awb-spacing-left-small:1.92%;"
			data-scroll-devices="small-visibility,medium-visibility,large-visibility">
			<div
				class="fusion-column-wrapper fusion-column-has-shadow fusion-flex-justify-content-flex-start fusion-content-layout-column">
				<div class="fusion-text fusion-text-10">
					<h6 style="text-align: left; --fontSize: 18; line-height: 1.5; --minFontSize: 18;"
						data-fontsize="18" data-lineheight="27px" class="fusion-responsive-typography-calculated">
						<p>Before starting to work on your new open-source format, please ensure that your <a href="https://github.com/${repoContext.owner}/${repoContext.name}/actions">github actions are enabled on your github repository</a>.</p> <p>You can also subscribe to our <a href="https://bevara-auth.ddns.net/login">premium services</a> to take benefits of our advanced compilation infrastructure.</p>
						
						</h6>
				</div>
			</div>
		</div>
		<div class="fusion-layout-column fusion_builder_column fusion-builder-column-7 fusion_builder_column_1_2 1_2 fusion-flex-column"
			style="--awb-padding-left:0px;--awb-bg-color:var(--awb-color2);--awb-bg-color-hover:var(--awb-color2);--awb-bg-size:cover;--awb-box-shadow:80px 20px 0px 40px var(--awb-color2);;--awb-width-large:50%;--awb-margin-top-large:0px;--awb-spacing-right-large:3.84%;--awb-margin-bottom-large:0px;--awb-spacing-left-large:3.84%;--awb-width-medium:100%;--awb-order-medium:0;--awb-spacing-right-medium:1.92%;--awb-spacing-left-medium:1.92%;--awb-width-small:100%;--awb-order-small:0;--awb-spacing-right-small:1.92%;--awb-spacing-left-small:1.92%;"
			data-scroll-devices="small-visibility,medium-visibility,large-visibility">
			
				<img src="${actionsGifPath}"  />
			
		</div>
		<div class="fusion-layout-column fusion_builder_column fusion-builder-column-8 fusion_builder_column_1_6 1_6 fusion-flex-column"
			style="--awb-bg-size:cover;--awb-width-large:16.666666666667%;--awb-margin-top-large:0px;--awb-spacing-right-large:11.52%;--awb-margin-bottom-large:0px;--awb-spacing-left-large:11.52%;--awb-width-medium:100%;--awb-order-medium:0;--awb-spacing-right-medium:1.92%;--awb-spacing-left-medium:1.92%;--awb-width-small:100%;--awb-order-small:0;--awb-spacing-right-small:1.92%;--awb-spacing-left-small:1.92%;">
			<div
				class="fusion-column-wrapper fusion-column-has-shadow fusion-flex-justify-content-flex-start fusion-content-layout-column">
			</div>
		</div>
	</div>
</div>

<div class="fusion-fullwidth fullwidth-box fusion-builder-row-5 fusion-flex-container has-pattern-background has-mask-background nonhundred-percent-fullwidth non-hundred-percent-height-scrolling"
	style="--awb-border-radius-top-left:0px;--awb-border-radius-top-right:0px;--awb-border-radius-bottom-right:0px;--awb-border-radius-bottom-left:0px;--awb-margin-top:20px;--awb-margin-bottom:20px;--awb-background-color:var(--awb-color1);--awb-flex-wrap:wrap;">
	<div class="fusion-builder-row fusion-row fusion-flex-align-items-flex-start fusion-flex-content-wrap"
		style="max-width:104%;margin-left: calc(-4% / 2 );margin-right: calc(-4% / 2 );">
		<div class="fusion-layout-column fusion_builder_column fusion-builder-column-9 fusion_builder_column_1_6 1_6 fusion-flex-column"
			style="--awb-bg-size:cover;--awb-width-large:16.666666666667%;--awb-margin-top-large:0px;--awb-spacing-right-large:11.52%;--awb-margin-bottom-large:0px;--awb-spacing-left-large:11.52%;--awb-width-medium:100%;--awb-order-medium:0;--awb-spacing-right-medium:1.92%;--awb-spacing-left-medium:1.92%;--awb-width-small:100%;--awb-order-small:0;--awb-spacing-right-small:1.92%;--awb-spacing-left-small:1.92%;">
			<div
				class="fusion-column-wrapper fusion-column-has-shadow fusion-flex-justify-content-flex-start fusion-content-layout-column">
			</div>
		</div>
		<div class="fusion-layout-column fusion_builder_column fusion-builder-column-10 fusion_builder_column_1_2 1_2 fusion-flex-column"
			style="">
			
				<img src="${menuGifPath}" width="50" />
			
		</div>
		<div class="fusion-layout-column fusion_builder_column fusion-builder-column-11 fusion_builder_column_1_3 1_3 fusion-flex-column"
			style="--awb-padding-top:20px;--awb-padding-bottom:20px;--awb-bg-size:cover;--awb-width-large:33.333333333333%;--awb-margin-top-large:40px;--awb-spacing-right-large:5.76%;--awb-margin-bottom-large:20px;--awb-spacing-left-large:5.76%;--awb-width-medium:100%;--awb-order-medium:0;--awb-spacing-right-medium:1.92%;--awb-spacing-left-medium:1.92%;--awb-width-small:100%;--awb-order-small:0;--awb-spacing-right-small:1.92%;--awb-spacing-left-small:1.92%;"
			data-scroll-devices="small-visibility,medium-visibility,large-visibility">
			<div
				class="fusion-column-wrapper fusion-column-has-shadow fusion-flex-justify-content-flex-start fusion-content-layout-column">
				<div class="fusion-text fusion-text-11 fusion-text-no-margin"
					style="--awb-margin-top:20px;--awb-margin-right:20px;">
					<h6 data-fontsize="18" style="--fontSize: 18; line-height: 1.5; --minFontSize: 18;"
						data-lineheight="27px" class="fusion-responsive-typography-calculated">
						<p>The Bevara Open-Source Developer IDE  allows to compile and tests our filter in development for free. </p>
						<p>When opening a <a href="https://github.com/Bevara?tab=repositories">filter project</a>, the Bevara SDK logo appears on the left side bar of visual studio. </p>
						
						
						.</h6>
				</div>
			</div>
		</div>
	</div>
</div>

<div class="fusion-fullwidth fullwidth-box fusion-builder-row-4 fusion-flex-container has-pattern-background has-mask-background nonhundred-percent-fullwidth non-hundred-percent-height-scrolling"
	style="--awb-border-radius-top-left:0px;--awb-border-radius-top-right:0px;--awb-border-radius-bottom-right:0px;--awb-border-radius-bottom-left:0px;--awb-padding-right:20px;--awb-padding-left:20px;--awb-margin-top:20px;--awb-margin-bottom:20px;--awb-background-color:var(--awb-color1);--awb-flex-wrap:wrap;">
	<div class="fusion-builder-row fusion-row fusion-flex-align-items-flex-start fusion-flex-content-wrap"
		style="max-width:104%;margin-left: calc(-4% / 2 );margin-right: calc(-4% / 2 );">
		<div class="fusion-layout-column fusion_builder_column fusion-builder-column-6 fusion_builder_column_1_3 1_3 fusion-flex-column"
			style="--awb-padding-top:20px;--awb-padding-bottom:20px;--awb-padding-left:20px;--awb-bg-size:cover;--awb-width-large:33.333333333333%;--awb-margin-top-large:20px;--awb-spacing-right-large:5.76%;--awb-margin-bottom-large:20px;--awb-spacing-left-large:5.76%;--awb-width-medium:100%;--awb-order-medium:0;--awb-spacing-right-medium:1.92%;--awb-spacing-left-medium:1.92%;--awb-width-small:100%;--awb-order-small:0;--awb-spacing-right-small:1.92%;--awb-spacing-left-small:1.92%;"
			data-scroll-devices="small-visibility,medium-visibility,large-visibility">
			<div
				class="fusion-column-wrapper fusion-column-has-shadow fusion-flex-justify-content-flex-start fusion-content-layout-column">
				<div class="fusion-text fusion-text-10">
					<h6 style="text-align: left; --fontSize: 18; line-height: 1.5; --minFontSize: 18;"
						data-fontsize="18" data-lineheight="27px" class="fusion-responsive-typography-calculated">
						<p> The Bevara compiler IDE is composed of several panels that allows to track every compilation and check whether or not a compilation successed.</p>
						<p>Compilation is triggered every times a commit is pushed to your github repository. </p> 
						
						</h6>
				</div>
			</div>
		</div>
		<div class="fusion-layout-column fusion_builder_column fusion-builder-column-7 fusion_builder_column_1_2 1_2 fusion-flex-column"
			style="--awb-padding-left:0px;--awb-bg-color:var(--awb-color2);--awb-bg-color-hover:var(--awb-color2);--awb-bg-size:cover;--awb-box-shadow:80px 20px 0px 40px var(--awb-color2);;--awb-width-large:50%;--awb-margin-top-large:0px;--awb-spacing-right-large:3.84%;--awb-margin-bottom-large:0px;--awb-spacing-left-large:3.84%;--awb-width-medium:100%;--awb-order-medium:0;--awb-spacing-right-medium:1.92%;--awb-spacing-left-medium:1.92%;--awb-width-small:100%;--awb-order-small:0;--awb-spacing-right-small:1.92%;--awb-spacing-left-small:1.92%;"
			data-scroll-devices="small-visibility,medium-visibility,large-visibility">
			
				<img src="${commitGifPath}"  width="400"/>
				<img src="${compilerPngPath}"  width="400"/>
			
		</div>
		<div class="fusion-layout-column fusion_builder_column fusion-builder-column-8 fusion_builder_column_1_6 1_6 fusion-flex-column"
			style="--awb-bg-size:cover;--awb-width-large:16.666666666667%;--awb-margin-top-large:0px;--awb-spacing-right-large:11.52%;--awb-margin-bottom-large:0px;--awb-spacing-left-large:11.52%;--awb-width-medium:100%;--awb-order-medium:0;--awb-spacing-right-medium:1.92%;--awb-spacing-left-medium:1.92%;--awb-width-small:100%;--awb-order-small:0;--awb-spacing-right-small:1.92%;--awb-spacing-left-small:1.92%;">
			<div
				class="fusion-column-wrapper fusion-column-has-shadow fusion-flex-justify-content-flex-start fusion-content-layout-column">
			</div>
		</div>
	</div>
</div>


<div class="fusion-fullwidth fullwidth-box fusion-builder-row-5 fusion-flex-container has-pattern-background has-mask-background nonhundred-percent-fullwidth non-hundred-percent-height-scrolling"
	style="--awb-border-radius-top-left:0px;--awb-border-radius-top-right:0px;--awb-border-radius-bottom-right:0px;--awb-border-radius-bottom-left:0px;--awb-margin-top:20px;--awb-margin-bottom:20px;--awb-background-color:var(--awb-color1);--awb-flex-wrap:wrap;">
	<div class="fusion-builder-row fusion-row fusion-flex-align-items-flex-start fusion-flex-content-wrap"
		style="max-width:104%;margin-left: calc(-4% / 2 );margin-right: calc(-4% / 2 );">
		<div class="fusion-layout-column fusion_builder_column fusion-builder-column-9 fusion_builder_column_1_6 1_6 fusion-flex-column"
			style="--awb-bg-size:cover;--awb-width-large:16.666666666667%;--awb-margin-top-large:0px;--awb-spacing-right-large:11.52%;--awb-margin-bottom-large:0px;--awb-spacing-left-large:11.52%;--awb-width-medium:100%;--awb-order-medium:0;--awb-spacing-right-medium:1.92%;--awb-spacing-left-medium:1.92%;--awb-width-small:100%;--awb-order-small:0;--awb-spacing-right-small:1.92%;--awb-spacing-left-small:1.92%;">
			<div
				class="fusion-column-wrapper fusion-column-has-shadow fusion-flex-justify-content-flex-start fusion-content-layout-column">
			</div>
		</div>
		<div class="fusion-layout-column fusion_builder_column fusion-builder-column-10 fusion_builder_column_1_2 1_2 fusion-flex-column"
			style="">
				<img src="${newLibGifPath}"  width="300"/>
			
		</div>
		<div class="fusion-layout-column fusion_builder_column fusion-builder-column-11 fusion_builder_column_1_3 1_3 fusion-flex-column"
			style="--awb-padding-top:20px;--awb-padding-bottom:20px;--awb-bg-size:cover;--awb-width-large:33.333333333333%;--awb-margin-top-large:40px;--awb-spacing-right-large:5.76%;--awb-margin-bottom-large:20px;--awb-spacing-left-large:5.76%;--awb-width-medium:100%;--awb-order-medium:0;--awb-spacing-right-medium:1.92%;--awb-spacing-left-medium:1.92%;--awb-width-small:100%;--awb-order-small:0;--awb-spacing-right-small:1.92%;--awb-spacing-left-small:1.92%;"
			data-scroll-devices="small-visibility,medium-visibility,large-visibility">
			<div
				class="fusion-column-wrapper fusion-column-has-shadow fusion-flex-justify-content-flex-start fusion-content-layout-column">
				<div class="fusion-text fusion-text-11 fusion-text-no-margin"
					style="--awb-margin-top:20px;--awb-margin-right:20px;">
					<h6 data-fontsize="18" style="--fontSize: 18; line-height: 1.5; --minFontSize: 18;"
						data-lineheight="27px" class="fusion-responsive-typography-calculated">
						<p> The Bevara compiler panel allows to track every compilation and check whether or not a compilation successed.</p>
						<p>If a compilation is sucessfull, the corresponding filter can be immediatly included to list of filters to be tested. </p>
						.</h6>
				</div>
			</div>
		</div>
	</div>
</div>
				
				
			<div class="fusion-layout-column" style="--awb-padding-top:20px;--awb-padding-right:40px;--awb-padding-bottom:20px;--awb-padding-left:40px;--awb-bg-size:cover;--awb-margin-top-large:20px;--awb-spacing-right-large:3.84%;--awb-margin-bottom-large:20px;--awb-spacing-left-large:3.84%;--awb-width-medium:100%;--awb-order-medium:0;--awb-spacing-right-medium:1.92%;--awb-spacing-left-medium:1.92%;--awb-width-small:100%;--awb-order-small:0;--awb-spacing-right-small:1.92%;--awb-spacing-left-small:1.92%;">
				<div class="fusion-column-wrapper fusion-column-has-shadow fusion-flex-justify-content-flex-start fusion-content-layout-column">
					<div class="fusion-text fusion-text-13">
						<h6>The Bevara series of IDEs use  a proprietary algorithm to analyze an input data file to determine an optimal Accessor for the file. Please, check out the <a href="https://bevara.com/documentation/"> documentation </a> to discover more about filter the filter functionning .</h6>
					</div>
				</div>
			</div>

				</body>
				</html>`;
	}
}