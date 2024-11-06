import * as vscode from "vscode";
import { WorkflowStepNode } from "../workflows/actions/workflowStepNode";

type WorkflowStepCommandArgs = Pick<WorkflowStepNode, "job" | "step" | "gitHubRepoContext">;

export function registerOpenWorkflowStepLogs(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("bevara-compiler.step.logs", async (args: WorkflowStepCommandArgs) => {
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
}
