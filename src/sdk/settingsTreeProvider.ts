import * as vscode from "vscode";

export type SettingsExplorerNode = BooleanTreeItem;

export class BooleanTreeItem extends vscode.TreeItem {
  constructor(
      public readonly label: string,
      public boolValue: boolean | undefined,
      public readonly collapsibleState: vscode.TreeItemCollapsibleState,
      public readonly category?: boolean
  ) {
      super(label, collapsibleState);
      this.description = (boolValue !== undefined) ? (boolValue ? 'True' : 'False') : '';
      this.contextValue = category ? 'category' : 'booleanItem'; // Assign context values for category and boolean item
  }

  command = this.boolValue !== undefined ? {
      command: 'bevara-compiler.use-dynamic-compilation',
      title: 'Use dynamic compiler',
      arguments: [this]
  } : undefined;
}


export class SettingsTreeProvider implements vscode.TreeDataProvider<SettingsExplorerNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SettingsExplorerNode | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  public settings: { [key: string]: BooleanTreeItem[] } = {
    'Compiler': [
        new BooleanTreeItem('Use dynamic compilation', false, vscode.TreeItemCollapsibleState.None)
    ]
};

  // Create the list of parent category items
    private rootItems: BooleanTreeItem[] = Object.keys(this.settings).map(category => 
      new BooleanTreeItem(category, undefined, vscode.TreeItemCollapsibleState.Collapsed, true)
  );

  getTreeItem(element: SettingsExplorerNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element;
  }

  getChildren(element?: SettingsExplorerNode ): SettingsExplorerNode[] {
    // Return the list of items when requested
    if (!element) {
      return this.rootItems;
    }

    if (element.category) {
      return this.settings[element.label] || [];
    }

    return [];
  }

  // Method to toggle boolean value and trigger tree update
  toggleBoolean(item: BooleanTreeItem): void {
    item.boolValue = !item.boolValue;
    item.description = item.boolValue ? 'True' : 'False';
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(null);
  }
}
