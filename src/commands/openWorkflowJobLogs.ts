import * as vscode from "vscode";
import {GitHubRepoContext} from "../git/repository";
import { WorkflowJob } from "../workflows/actions/WorkflowJob";
import { buildLogURI } from "../logs/scheme";
import { getLogInfo } from "../logs/logInfo";
import { updateDecorations } from "../logs/formatProvider";


export interface OpenWorkflowJobLogsCommandArgs {
  gitHubRepoContext: GitHubRepoContext;
  job: WorkflowJob;
}

export function registerOpenWorkflowJobLogs(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("bevara-compiler.workflow.logs", async (args: OpenWorkflowJobLogsCommandArgs) => {
      const gitHubRepoContext = args.gitHubRepoContext;
      const job = args.job;
      const uri = buildLogURI(
        `%23${job.job.run_id} - ${job.job.name}`,
        gitHubRepoContext.owner,
        gitHubRepoContext.name,
        job.job.id
      );

      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, {
        preview: false
      });

      const logInfo = getLogInfo(uri);
      if (!logInfo) {
        throw new Error("Could not get log info");
      }

      //Custom formatting after the editor has been opened
      updateDecorations(editor, logInfo);
    })
  );
}
