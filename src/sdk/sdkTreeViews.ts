import * as vscode from "vscode";
import { RunStore } from "../workflows/actions/store";
import { CompilationTreeProvider } from "./compilationTreeProvider";
import { getGitHubContext } from "../git/repository";
import { SettingsTreeProvider } from "./settingsTreeProvider";
import { ActionsViewProvider } from './actionsWebviewProvider';
import { BevaraAuthenticationProvider } from "../auth/authProvider";
import { registerDynamicCompilation } from "../commands/compilation";
import { Credentials } from "../auth/credentials";
import { registerInstallWorkflow } from "../commands/installWorkflow";

export async function initSdkTreeViews(context: vscode.ExtensionContext, store: RunStore, bevaraAuthenticationProvider: BevaraAuthenticationProvider): Promise<void> {
  const compilationTreeProvider = new CompilationTreeProvider(context, store);
  const credentials = new Credentials();
  await credentials.initialize(context, bevaraAuthenticationProvider);
  
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('bevara-compiler.compiler', compilationTreeProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("bevara-compiler.refreshEntry", async () => {
      await compilationTreeProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("bevara-compiler.deleteAllEntry", async () => {
      const result = await vscode.window.showInformationMessage(
        'Do you want to proceed to the deletion?',
        'Yes',
        'No'
      );

      if (result === 'Yes') {
        await compilationTreeProvider.deleteAllEntry();
      } 
    })
  );

  const actionsViewProvider = new ActionsViewProvider(context, credentials);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ActionsViewProvider.viewType, actionsViewProvider));

  const settingsTreeProvider = new SettingsTreeProvider(context, credentials);
  context.subscriptions.push(vscode.window.registerTreeDataProvider("bevara-compiler.settings", settingsTreeProvider));
  registerDynamicCompilation(context, settingsTreeProvider, actionsViewProvider, compilationTreeProvider);
  registerInstallWorkflow(context, compilationTreeProvider);


  // const currentBranchTreeProvider = new CurrentBranchTreeProvider(store);
  // context.subscriptions.push(
  //   vscode.window.registerTreeDataProvider("github-actions.current-branch", currentBranchTreeProvider)
  // );

  // context.subscriptions.push(
  //   vscode.commands.registerCommand("github-actions.explorer.refresh", async () => {
  //     const canReachAPI = await canReachGitHubAPI();
  //     await vscode.commands.executeCommand("setContext", "github-actions.internet-access", canReachAPI);

  //     const ghContext = await getGitHubContext();
  //     const hasGitHubRepos = ghContext && ghContext.repos.length > 0;
  //     await vscode.commands.executeCommand("setContext", "github-actions.has-repos", hasGitHubRepos);

  //     if (canReachAPI && hasGitHubRepos) {
  //       await workflowTreeProvider.refresh();
  //       await settingsTreeProvider.refresh();
  //     }
  //     await executeCacheClearCommand();
  //   })
  // );

  // context.subscriptions.push(
  //   vscode.commands.registerCommand("github-actions.explorer.current-branch.refresh", async () => {
  //     await currentBranchTreeProvider.refresh();
  //   })
  // );

  const gitHubContext = await getGitHubContext();
  if (!gitHubContext) {
    //logDebug("Could not register branch change event handler");
    return;
  }

  // Periodically check for new compilation in the repository
  const intervalId = setInterval(() => {
    compilationTreeProvider.refresh();
  }, 10000);

  // Wrap the interval in a Disposable
  const checkUpdateDisposable = {
    dispose: () => {
      clearInterval(intervalId);
    },
  };


  context.subscriptions.push(checkUpdateDisposable);

  for (const repo of gitHubContext.repos) {
    if (!repo.repositoryState) {
      continue;
    }

    let currentAhead = repo.repositoryState.HEAD?.ahead;
    let currentHeadName = repo.repositoryState.HEAD?.name;
    repo.repositoryState.onDidChange(async () => {
      // When the current head/branch changes, or the number of commits ahead changes (which indicates
      // a push), refresh the current-branch view

      if (
        repo.repositoryState?.HEAD?.name !== currentHeadName ||
        (repo.repositoryState?.HEAD?.ahead || 0) < (currentAhead || 0)
      ) {
        currentHeadName = repo.repositoryState?.HEAD?.name;
        currentAhead = repo.repositoryState?.HEAD?.ahead;
        await compilationTreeProvider.refresh();
      }
    });
  }
}
