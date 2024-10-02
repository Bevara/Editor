//@ts-check

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
    const vscode = acquireVsCodeApi();

    const accept_EULA = document.querySelector('.acceptEULA');
    accept_EULA.style.width = '400px';

    accept_EULA?.addEventListener('click', () => {
        vscode.postMessage({ type: 'acceptEULA' });
    });
}());


