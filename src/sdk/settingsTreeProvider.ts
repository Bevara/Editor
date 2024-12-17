import * as vscode from "vscode";
import { BevaraAuthenticationProvider } from "../auth/authProvider";
import { Credentials } from "../auth/credentials";

export type SettingsExplorerNode = DynamicCompilationTreeItem | DebugCompilationTreeItem | TreeItem;

class TreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command
  ) {
    super(label, collapsibleState);
  }
}

export class DynamicCompilationTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public boolValue: boolean | undefined,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly category?: boolean
  ) {
    super(label, collapsibleState);
    this.description = (boolValue !== undefined) ? (boolValue ? 'True' : 'False') : '';
    this.contextValue = category ? 'category' : 'booleanItem'; // Assign context values for
  }

  command = this.boolValue !== undefined ? {
    command: 'bevara-compiler.use-dynamic-compilation',
    title: 'Use dynamic compiler',
    arguments: [this]
  } : undefined;
}

export class DebugCompilationTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public boolValue: boolean | undefined,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly category?: boolean
  ) {
    super(label, collapsibleState);
    this.description = (boolValue !== undefined) ? (boolValue ? 'True' : 'False') : '';
    this.contextValue = category ? 'category' : 'booleanItem'; // Assign context values for
  }

  command = this.boolValue !== undefined ? {
    command: 'bevara-compiler.use-debug-compilation',
    title: 'Compile with debug information',
    arguments: [this]
  } : undefined;
}


export class SettingsTreeProvider implements vscode.TreeDataProvider<SettingsExplorerNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SettingsExplorerNode | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
      private readonly _context: vscode.ExtensionContext,
      private readonly _credentials : Credentials
    ) {
      _credentials.addEventEmitter(this._onDidChangeTreeData);
  }

  public settings: { [key: string]: SettingsExplorerNode[] } = {
    'Compiler': [
      new DynamicCompilationTreeItem('Use dynamic compilation', false, vscode.TreeItemCollapsibleState.None),
      new DebugCompilationTreeItem('Compile with debug information', false, vscode.TreeItemCollapsibleState.None)
    ]
  };

  getTreeItem(element: SettingsExplorerNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element;
  }

  getChildren(element?: SettingsExplorerNode): SettingsExplorerNode[] {
    // Return the list of items when requested
    if (!element) {
      if (this._credentials.isPayedUser == true){
        return [new TreeItem('Compiler', vscode.TreeItemCollapsibleState.Expanded)];
      }
      return [];
    }

    if (element.label) {
      const settings = this.settings[element.label] || [];
      return settings;
    }

    return [];
  }

  // Method to toggle boolean value and trigger tree update
  toggleBoolean(item: DynamicCompilationTreeItem | DebugCompilationTreeItem): void {
    item.boolValue = !item.boolValue;
    item.description = item.boolValue ? 'True' : 'False';
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(null);
  }
}
