// This script is run within the webview itself
(function () {
	// @ts-ignore
	const vscode = acquireVsCodeApi();

	class BevaraDrawEditor {
		constructor( /** @type {HTMLElement} */ preview) {
			this._preview = preview;
		}
		async injectData(data) {
			const blob = new Blob([data], { 'type': 'image/jp2' });
			const url = URL.createObjectURL(blob);
			this._preview.innerHTML= `<img is="universal-img" src="${url}" using="core-img.wasm" with="j2kdec.wasm" controls  connections>`;
		}
	}

	const editor = new BevaraDrawEditor(document.querySelector('.drawing-preview'));

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