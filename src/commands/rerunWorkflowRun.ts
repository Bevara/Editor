import * as vscode from "vscode";
import * as fs from 'fs';
import * as path from 'path';

import { WorkflowRunCommandArgs } from "../workflows/actions/workflowRunNode";
import { InternalRunNode } from "../workflows/internal/internalRunNode";
import { compileProject, getCompilationOutputPath, rootPath } from "./compilation";

export function registerRerunCompilation(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.commands.registerCommand("bevara-compiler.actions.workflow.run.rerun", async (args: WorkflowRunCommandArgs) => {
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

  context.subscriptions.push(vscode.commands.registerCommand("bevara-compiler.internal.workflow.run.rerun", async (args: InternalRunNode) => {
    const folder = rootPath();
    if (folder) {
      const output = getCompilationOutputPath(folder);
      const sourceZip = path.join(args.folder, "build", "source.zip");
      fs.readFile(sourceZip,
        function (err, data) {
            if (err)
              vscode.window.showErrorMessage(err.message);
            else
              compileProject(data, output);
        });
    }
  }));
}