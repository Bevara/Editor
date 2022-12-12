// This script is run within the webview itself
(function () {
	// @ts-ignore
	const vscode = acquireVsCodeApi();

	/**
	* @param {Uint8Array} initialContent 
	* @return {Promise<HTMLImageElement>}
	*/
	async function loadImageFromData(initialContent) {
		const blob = new Blob([initialContent], { 'type': 'image/png' });
		const url = URL.createObjectURL(blob);
		try {
			const img = document.createElement('img');
			img.crossOrigin = 'anonymous';
			img.src = url;
			await new Promise((resolve, reject) => {
				img.onload = resolve;
				img.onerror = reject;
			});
			return img;
		} finally {
			URL.revokeObjectURL(url);
		}
	}

	class BevaraDrawEditor {
		constructor( /** @type {HTMLElement} */ preview) {
			this._preview = preview;
		}
		async injectData(data) {

		}
	}

	const editor = new BevaraDrawEditor(document.querySelector('#preview'));

	// Handle messages from the extension
	window.addEventListener('message', async e => {
		const { type, body, requestId } = e.data;
		switch (type) {
			case 'init':
				{
					// Load the initial image into the canvas.
					await editor.injectData(body.value);
					return;
				}
		}
	});


	// Signal to VS Code that the webview is initialized.
	vscode.postMessage({ type: 'ready' });
}());