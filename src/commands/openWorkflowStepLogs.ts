import * as vscode from "vscode";
import * as path from 'path';
import { WorkflowStepNode } from "../workflows/actions/workflowStepNode";
import { InternalStepNode } from "../workflows/internal/internalStepNode";
import { updateDecorations } from "../logs/formatProvider";
import { getLogInfo } from "../logs/logInfo";
import { buildInternalStepLogURI } from "../logs/scheme";

type WorkflowStepCommandArgs = Pick<WorkflowStepNode, "job" | "step" | "gitHubRepoContext">;

export function registerOpenWorkflowStepLogs(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("bevara-compiler.actions.step.logs", async (args: WorkflowStepCommandArgs) => {
      const job = args.job.job;
      let url = job.html_url ?? "";
      const stepName = args.step.name;

      const index = job.steps && job.steps.findIndex((step:any) => step.name === stepName) + 1;

      if (url && index) {
        url = url + "#step:" + index.toString() + ":1";
      }

      await vscode.env.openExternal(vscode.Uri.parse(url));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("bevara-compiler.internal.step.logs", async (args: InternalStepNode) => {
      const uri = buildInternalStepLogURI(
        args.fullpath,
        args.label
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
