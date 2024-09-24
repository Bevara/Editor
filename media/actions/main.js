//@ts-check

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
    const vscode = acquireVsCodeApi();

    const changeBox = document.querySelector('.changeBox');
    const commitAndPushButton = document.querySelector('.commit-and-push');
    
    const newArtifactsBox = document.querySelector('.newArtifactsBox');
    const updateArtifactButton = document.querySelector('.updateArtifact');

    commitAndPushButton?.addEventListener('click', () => {
        vscode.postMessage({ type: 'showGitSCM' });
    });

    updateArtifactButton?.addEventListener('click', () => {
        vscode.postMessage({ type: 'updateArtifact' });
    });

    //Initial state of boxes
    changeBox.style.display = "none";
    newArtifactsBox.style.display = "none";

    // Handle messages sent from the extension to the webview
    window.addEventListener('message', event => {
        const message = event.data; // The json data that the extension sent
        switch (message.type) {
            case 'hideChangeBox':
                {
                    changeBox.style.display = "none";
                    break;
                }
            case 'showChangeBox':
                {
                    changeBox.style.display = "block";
                    break;
                }
            case 'hideNewArtifacts':
                {
                    newArtifactsBox.style.display = "none";
                    break;
                }
            case 'showNewArtifacts':
                {
                    newArtifactsBox.style.display = "block";
                    break;
                }
        }
    });

}());


