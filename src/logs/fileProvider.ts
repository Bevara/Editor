import * as vscode from "vscode";
import * as fs from 'fs';
import * as path from 'path';

import { OctokitResponse } from "@octokit/types";
import { getGitHubContextForRepo } from "../git/repository";
import { cacheLogInfo } from "./logInfo";
import { parseLog } from "./model";
import { parseUri } from "./scheme";

export class ActionsWorkflowStepLogProvider implements vscode.TextDocumentContentProvider {
  onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  onDidChange = this.onDidChangeEmitter.event;

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const { owner, repo, jobId } = parseUri(uri);

    const githubRepoContext = await getGitHubContextForRepo(owner, repo);
    if (!githubRepoContext) {
      throw new Error("Could not load logs");
    }

    try {
      const result = await githubRepoContext?.client.actions.downloadJobLogsForWorkflowRun({
        owner: owner,
        repo: repo,
        job_id: jobId
      });

      const log = result.data;

      const logInfo = parseLog(log as string);
      cacheLogInfo(uri, logInfo);

      return logInfo.updatedLogLines.join("\n");
    } catch (e) {
      const respErr = e as OctokitResponse<unknown, number>;
      if (respErr.status === 410) {
        cacheLogInfo(uri, {
          sections: [],
          updatedLogLines: [],
          styleFormats: []
        });

        return "Could not open logs, they are expired.";
      }

      console.error("Error loading logs", e);
      return `Could not open logs, unhandled error. ${(e as Error).message}`;
    }
  }
}

export class InternalWorkflowJobLogProvider implements vscode.TextDocumentContentProvider {
  onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  onDidChange = this.onDidChangeEmitter.event;

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    try {
      const items = fs.readdirSync(uri.path);
      let log = '';
      for (const item of items) {
        const fullPath = path.join(uri.path, item);
        if (item.startsWith('.')) {
          continue;
        }

        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
          const terminalPath = path.join(fullPath, "TERMINAL");
          if (fs.existsSync(terminalPath)) {
            const data = fs.readFileSync(terminalPath, "utf-8");
            log += data;
          }
        }
      }

      const logInfo = parseLog(log as string);
      cacheLogInfo(uri, logInfo);

      return logInfo.updatedLogLines.join("\n");
    } catch (e: any) {
      cacheLogInfo(uri, {
        sections: [],
        updatedLogLines: [],
        styleFormats: []
      });
      console.error("Error loading logs", e);
      return `Could not open logs, unhandled error. ${(e as Error).message}`;
    }
  }
}

export class InternalWorkflowStepLogProvider implements vscode.TextDocumentContentProvider {
  onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  onDidChange = this.onDidChangeEmitter.event;

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    try {
      const dirPath = uri.path.replace(/\/$/, "");
      const terminalPath = path.join(dirPath, "TERMINAL");
      const log = fs.readFileSync(terminalPath, "utf-8");

      const logInfo = parseLog(log as string);
      cacheLogInfo(uri, logInfo);

      return logInfo.updatedLogLines.join("\n");
    } catch (e: any) {
      cacheLogInfo(uri, {
        sections: [],
        updatedLogLines: [],
        styleFormats: []
      });
      return `No terminal information`;
    }
  }
}