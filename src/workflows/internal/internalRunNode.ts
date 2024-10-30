import * as vscode from "vscode";
import { InternalRun } from "./internalRun";
import { getIconForWorkflowRun } from "../actions/icons";
import { InternalJobNode } from "./internalJobNode";

export class InternalRunNode extends vscode.TreeItem {
  constructor(
    public readonly folder: string,
    public readonly internalName: string,
    public run: InternalRun
  ) {
    super(InternalRunNode._getLabel(run, internalName), vscode.TreeItemCollapsibleState.Collapsed);
    this.updateRun(run);
  }

  updateRun(run: InternalRun) {
    this.run = run;
    this.label = InternalRunNode._getLabel(run, this.internalName);
    this.contextValue = this.run.contextValue();
    this.iconPath = getIconForWorkflowRun(this.run.run);
  }

  private static _getLabel(run: InternalRun, internalName: string): string {
    return `Compilation #${internalName}` ;
  }

  async getJobs(): Promise<InternalJobNode[]> {
    const jobs = await this.run.jobs();

    const children = jobs.map(
      job => new InternalJobNode(job)
    );

    return children;
  }
}
