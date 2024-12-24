import * as vscode from "vscode";

import {GitHubRepoContext} from "../git/repository";
import { addToLibsActions, removeArtifactId } from "../filters/libraries";
import { SettingsTreeProvider } from "../sdk/settingsTreeProvider";
import { CompilationTreeProvider } from "../sdk/compilationTreeProvider";

interface InstallWorkflowCommandOptions {
  gitHubRepoContext: GitHubRepoContext;
  artifactId : number;
  updateContextValue(): void;
}

export function registerInstallWorkflow(context: vscode.ExtensionContext,compilationTreeProvider : CompilationTreeProvider) {
  context.subscriptions.push(
    vscode.commands.registerCommand("bevara-compiler.workflow.install", async (args: InstallWorkflowCommandOptions) => {
      await addToLibsActions(context, args.gitHubRepoContext, args.artifactId);
      compilationTreeProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("bevara-compiler.workflow.uninstall", async (args: InstallWorkflowCommandOptions) => {
      await removeArtifactId(context, args.artifactId);
      compilationTreeProvider.refresh();
    })
  );
}
