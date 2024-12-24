import * as vscode from "vscode";

import { GitHubRepoContext } from "../git/repository";
import { addToLibsActions, removeArtifactId } from "../filters/libraries";
import { CompilationTreeProvider } from "../sdk/compilationTreeProvider";

interface InstallWorkflowCommandOptions {
  gitHubRepoContext: GitHubRepoContext;
  artifactId: number;
  updateContextValue(): void;
}

export function registerInstallWorkflow(context: vscode.ExtensionContext, compilationTreeProvider: CompilationTreeProvider) {
  context.subscriptions.push(
    vscode.commands.registerCommand("bevara-compiler.workflow.install", async (args: InstallWorkflowCommandOptions) => {
      if (args.gitHubRepoContext) {
        await addToLibsActions(context, args.gitHubRepoContext, args.artifactId);
        compilationTreeProvider.refresh();
      } else {
        vscode.window.showInformationMessage("Please wait and try again!");
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("bevara-compiler.workflow.uninstall", async (args: InstallWorkflowCommandOptions) => {
      if (args.gitHubRepoContext) {
        await removeArtifactId(context, args.artifactId);
        compilationTreeProvider.refresh();
      } else {
        vscode.window.showInformationMessage("Please wait and try again!");
      }
    })
  );
}
