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
    this.contextValue = "s_internal";
    if (this.step.status === "completed") {
      this.contextValue += " completed";
    }

    const returnPath = path.join(fullpath, "RETURNCODE");

    if (fs.existsSync(returnPath)) {
      const returnStatus = fs.readFileSync(returnPath, 'utf8');
      this.step.conclusion = returnStatus == '0' ? 'success' : 'failure';
    }

    this.iconPath = getIconForWorkflowStep(this.step);
  }
}
