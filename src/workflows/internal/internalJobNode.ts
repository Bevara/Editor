import * as vscode from "vscode";
import { InternalJob } from "./internalJob";
import { getIconForWorkflowRun } from "../actions/icons";
import { InternalStepNode } from "./internalStepNode";


export class InternalJobNode extends vscode.TreeItem {
 public contextValue?: string;
 
  constructor(public readonly job: InternalJob) {
    super(
      job.name,
      (job.steps && job.steps.length > 0 && vscode.TreeItemCollapsibleState.Collapsed) || undefined
    );

    this.contextValue = "job";
    if (this.job.job.status === "completed") {
      this.contextValue += " completed";
    }

    this.iconPath = getIconForWorkflowRun(this.job.job);
  }

  hasSteps(): boolean {
    return !!(this.job.steps && this.job.steps.length > 0);
  }

  getSteps(): InternalStepNode[] {
    return (this.job.steps || []).map((s:any) => new InternalStepNode( s, this.job, this.job.job));
  }
}
