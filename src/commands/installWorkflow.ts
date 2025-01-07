import * as vscode from "vscode";

import { GitHubRepoContext } from "../git/repository";
import { addToLibsActions, removeArtifactId, addToLibsInternal, removeInternalId } from "../filters/libraries";
import { CompilationTreeProvider } from "../sdk/compilationTreeProvider";
import {  rootPath } from "./compilation";

interface InstallWorkflowCommandOptions {
  gitHubRepoContext: GitHubRepoContext;
  artifactId: number;
  updateContextValue(): void;
}

interface InstallInternalCommandOptions {
  internalName: string;
  folder : string;
}

export function registerInstallWorkflow(context: vscode.ExtensionContext, compilationTreeProvider: CompilationTreeProvider) {
  context.subscriptions.push(
    vscode.commands.registerCommand("bevara-compiler.workflow.install", async (args: InstallWorkflowCommandOptions) => {
      if (!args.gitHubRepoContext) {
        vscode.window.showInformationMessage("Please wait and try again!");
        return;
      }

      await addToLibsActions(context, args.gitHubRepoContext, args.artifactId);
      compilationTreeProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("bevara-compiler.workflow.uninstall", async (args: InstallWorkflowCommandOptions) => {
      if (!args.gitHubRepoContext) {
        vscode.window.showInformationMessage("Please wait and try again!");
        return;
      }
      await removeArtifactId(context, args.artifactId);
      compilationTreeProvider.refresh();
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("bevara-compiler.internal.install", async (args: InstallInternalCommandOptions) => {
      const folder = rootPath();

      if (folder && args.internalName){
        await addToLibsInternal(context, folder, args.internalName);
        compilationTreeProvider.refresh();
      }else{
        vscode.window.showInformationMessage("Error : cant add this library!");
      }
      
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("bevara-compiler.internal.uninstall", async (args: InstallInternalCommandOptions) => {
      await removeInternalId(context, args.folder);
      compilationTreeProvider.refresh();
    })
  );
}
