import * as vscode from "vscode";

export class InternalRunNode extends vscode.TreeItem {
  constructor(
    public readonly folder: string,
    public readonly internalName: string
  ) {
    super(InternalRunNode._getLabel(internalName), vscode.TreeItemCollapsibleState.Collapsed);
  }

  private static _getLabel(internalName: string): string {
    return `Compilation #${internalName}` ;
  }

  async getJobs(): Promise<[]> {
    
    return [];
  }

}
