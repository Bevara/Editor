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
					this._tag = 'audio is=universal-audio controls'
					break;
				case 'video':
					this._tag = 'video is=universal-video'
					break;
				case 'canvas':
					this._tag = 'canvas is=universal-canvas'
					break;
			}

			const blob = new Blob([data], { 'type': 'application/x-bevara' });
			this._url = URL.createObjectURL(blob);

			this._preview.innerHTML = `<${this._tag} src="${this._url}"">`;
		}

		get tag() {
			return {
				preview: `<${this._tag} src="${this._url}" with="${this._decoders}" printerr="#output" controls connections>`,
				text: `<${this._tag} src="${this._uri}" with="${this._decoders}">`,
			};
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