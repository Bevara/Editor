import * as vscode from "vscode";
import * as fs from 'fs';
import * as path from 'path';
import { InternalJob } from "./internalJob";
import { getIconForWorkflowStep, StatusAndConclusion } from "../actions/icons";


export class InternalStepNode extends vscode.TreeItem {
  constructor(
    public readonly fullpath: string,
    public readonly job: InternalJob,
    public readonly step: StatusAndConclusion
  ) {
    const namePath = path.join(fullpath, "NAME");
    let name = "";

    if (fs.existsSync(namePath)) {
      name = fs.readFileSync(namePath, 'utf8');
    }

    super(name);
    this.contextValue = "step";
    if (this.step.status === "completed") {
      this.contextValue += " completed";
    }

    this.iconPath = getIconForWorkflowStep(this.step);
  }
}
