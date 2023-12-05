import { Uri } from 'vscode';

const _ = {
    groupBy: require('lodash.groupby')
};

export interface IBevNode {
    sourceUri: Uri ;
    label: string;
    parent: string | null ;

    nodes: IBevNode[];
}


export function treeFromPaths (files :any[], sourceUri : Uri, label = '') : IBevNode {
    return {
      sourceUri: sourceUri,
      label: label,
      parent: null,
      nodes: childNodesFromPaths(files, '', sourceUri)
    };
  }
  
  export function childNodesFromPaths (files:any[], parent:string, sourceUri:Uri) : IBevNode[] {
    // Group by first path element
    var groups = _.groupBy(files, (file: string) => file.match(/^[^/]*\/?/));
    return Object.keys(groups).map(function (groupKey) {
      const group = groups[groupKey];
      // Is this group explicitly part of the result, or
      // just implicit through its children
      const explicit = group.indexOf(groupKey) >= 0;
      return {
        sourceUri: sourceUri,
        label: groupKey,
        parent: parent,
        nodes: childNodesFromPaths(
          // Remove parent directory from file paths
          group
            .map((node : string) => node.substr(groupKey.length))
            // Skip the empty path
            .filter((node:string) => node),
          // New parent..., normalize to one trailing slash
          parent + groupKey,
          sourceUri
        )
      };
    });
  }