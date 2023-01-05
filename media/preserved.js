// This script is run within the webview itself
(function () {
	// @ts-ignore
	const vscode = acquireVsCodeApi();

	class BevaraViewer {
		constructor(/** @type {HTMLElement} */ preview) {
			this._preview = preview;
		}

		setData(supported, data) {
			switch (supported){
				case 'image':
					this._tag = 'img is=universal-img'
					break;
				case 'audio':
					this._tag = 'audio is=universal-audio'
					break;
				case 'video':
					this._tag = 'video is=universal-video'
					break;
				case 'video':
					this._tag = 'canvas is=universal-canvas'
					break;
			}

			const blob = new Blob([data], { 'type': 'application/x-bevara' });
			this._url = URL.createObjectURL(blob);

			this._preview.innerHTML = `<${this._tag} src="${this._url}"">`;
		}

	}

	const viewer = new BevaraViewer(
		document.querySelector('.drawing-preview')
	);

	// Handle messages from the extension
	window.addEventListener('message', async e => {
		const { type, body, requestId } = e.data;
		switch (type) {
			case 'init':
				{
					viewer.setData(body.supported, body.value);
					return;
				}
		}
	});

	// Signal to VS Code that the webview is initialized.
	vscode.postMessage({ type: 'ready' });

}());