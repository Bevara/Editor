//@ts-check

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
    const vscode = acquireVsCodeApi();

    const changeBox = document.querySelector('.changeBox');
    const commitAndPushButton = document.querySelector('.commit-and-push');

    const newArtifactsBox = document.querySelector('.newArtifactsBox');
    const updateArtifactButton = document.querySelector('.updateArtifact');

    const authBevaraBox = document.querySelector('.authBevaraBox');
    const authBevaraButton = document.querySelector('.auth-bevara');

    const authGithubBox = document.querySelector('.authGithubBox');
    const authGithubButton = document.querySelector('.auth-github');

    commitAndPushButton?.addEventListener('click', () => {
        vscode.postMessage({ type: 'showGitSCM' });
    });

    updateArtifactButton?.addEventListener('click', () => {
        vscode.postMessage({ type: 'updateArtifact' });
    });

    authBevaraButton?.addEventListener('click', () => {
        vscode.postMessage({ type: 'loginToBevara' });
    });

    authGithubButton?.addEventListener('click', () => {
        vscode.postMessage({ type: 'loginToGithub' });
    });



    //Initial state of boxes
    changeBox.style.display = "none";
    newArtifactsBox.style.display = "none";
    authBevaraBox.style.display = "none";
    authGithubBox.style.display = "none";

    // Handle messages sent from the extension to the webview
    window.addEventListener('message', e => {
        const { type, body, requestId } = e.data;

        switch (type) {
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
            case 'updateProfile':
                {
                    if (body.account){
                        authBevaraBox.style.display = "none";
                    }else{
                        authBevaraBox.style.display = "block";
                    }

                    if (body.github){
                        authGithubBox.style.display = "none";
                    }else{
                        authGithubBox.style.display = "block";
                    }
                    break;
                }
        }
    });
    vscode.postMessage({ type: 'ready' });
}());


