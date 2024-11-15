import * as vscode from "vscode";
import { ActionsLogScheme, InternaJobLogScheme, InternaStepLogScheme } from "./constants";
import { TreeItemLabel } from "vscode";

export function buildActionsLogURI(displayName: string, owner: string, repo: string, jobId: number): vscode.Uri {
  return vscode.Uri.parse(`${ActionsLogScheme}://${owner}/${repo}/${displayName}?${jobId}`);
}

export function buildInternalJobLogURI(fullPath : string): vscode.Uri {
  return vscode.Uri.parse(`${InternaJobLogScheme}:${fullPath}`);
}

export function buildInternalStepLogURI(fullPath : string, label:string | TreeItemLabel | undefined): vscode.Uri {
  return vscode.Uri.parse(`${InternaStepLogScheme}:${fullPath}/Step-${label}`);
}

export function parseUri(uri: vscode.Uri): {
  owner: string;
  repo: string;
  jobId: number;
} {
  if (uri.scheme != ActionsLogScheme) {
    throw new Error("Uri is not of log scheme");
  }

  return {
    owner: uri.authority,
    repo: uri.path.split("/").slice(0, 2).join(""),
    jobId: parseInt(uri.query, 10)
  };
}
