import * as vscode from "vscode";

import * as AdmZip from 'adm-zip';

import { WorkflowRunCommandArgs } from "../workflows/workflowRunNode";
import { BooleanTreeItem, SettingsTreeProvider } from "../sdk/settingsTreeProvider";
import { isInternalCompiler, setInternalCompiler } from "../sdk/options";
import { ActionsViewProvider } from "../sdk/actionsWebviewProvider";
import { CompilationTreeProvider } from "../sdk/compilationTreeProvider";

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

export function registerDynamicCompilation(context: vscode.ExtensionContext, 
  settingsTreeProvider: SettingsTreeProvider,
  actionsViewProvider : ActionsViewProvider,
  compilationTreeProvider : CompilationTreeProvider
) {
  const isInternal = isInternalCompiler(context);
  settingsTreeProvider.settings['Compiler'] = [
    new BooleanTreeItem('Use dynamic compilation',isInternal , vscode.TreeItemCollapsibleState.None)
  ];
  
  actionsViewProvider.toggleInternalCompiler(isInternal);
  compilationTreeProvider.toggleInternalCompiler(isInternal);

  context.subscriptions.push(vscode.commands.registerCommand("bevara-compiler.use-dynamic-compilation", async (item: BooleanTreeItem) => {
    if (item.boolValue == undefined) return;
    settingsTreeProvider.toggleBoolean(item);
    setInternalCompiler(context, item.boolValue);
    actionsViewProvider.toggleInternalCompiler(item.boolValue);
    compilationTreeProvider.toggleInternalCompiler(item.boolValue);
  }));
}

export function compileProject(
  path : string
) {
  const zip = new AdmZip();
  zip.addLocalFolder(path);
  console.log(path);
}