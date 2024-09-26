import * as vscode from "vscode";
import { WorkflowRunCommandArgs } from "../workflows/workflowRunNode";
import { BooleanTreeItem, SettingsTreeProvider } from "../sdk/settingsTreeProvider";

export function registerRerunCompilation(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.commands.registerCommand("bevara-compiler.workflow.run.rerun", async (args: WorkflowRunCommandArgs) => {
      const gitHubRepoContext = args.gitHubRepoContext;
      const run = args.run;

      try {
        await gitHubRepoContext.client.actions.reRunWorkflow({
          owner: gitHubRepoContext.owner,
          repo: gitHubRepoContext.name,
          run_id: run.run.id
        });
      } catch (e) {
        await vscode.window.showErrorMessage(`Could not rerun compilation: '${(e as Error).message}'`);
      }

      // Start refreshing the run to reflect rerunning in UI
      args.store.pollRun(run.run.id, gitHubRepoContext, 1000, 20);
    }));
}

export function registerDynamicCompilation(context: vscode.ExtensionContext, settingsTreeProvider: SettingsTreeProvider) {
  context.subscriptions.push(vscode.commands.registerCommand("bevara-compile.use-dynamic-compilation", async (item: BooleanTreeItem) => {
    settingsTreeProvider.toggleBoolean(item);
  }));
}
