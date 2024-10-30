import * as vscode from "vscode";
import * as AdmZip from 'adm-zip';
import * as https from 'https';
import * as http from 'http';
import * as FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';

import { config } from '../util';

import { WorkflowRunCommandArgs } from "../workflows/actions/workflowRunNode";
import { BooleanTreeItem, SettingsTreeProvider } from "../sdk/settingsTreeProvider";
import { isInternalCompiler, setInternalCompiler } from "../sdk/options";
import { ActionsViewProvider } from "../sdk/actionsWebviewProvider";
import { CompilationTreeProvider } from "../sdk/compilationTreeProvider";

export function registerRerunCompilation(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.commands.registerCommand("bevara-compiler.workflow.run.rerun", async (args: WorkflowRunCommandArgs) => {
    const gitHubRepoContext = args.gitHubRepoContext;
    const run = args.run;

    try {
      await gitHubRepoContext.client.actions.reRunWorkflow({
        owner: gitHubRepoContext.owner,
        repo: gitHubRepoContext.name,
        run_id: run.run.id
      });
    } catch (e) {
      await vscode.window.showErrorMessage(`Could not rerun compilation: '${(e as Error).message}'`);
    }

    // Start refreshing the run to reflect rerunning in UI
    args.store.pollRun(run.run.id, gitHubRepoContext, 1000, 20);
  }));
}

export function registerDynamicCompilation(context: vscode.ExtensionContext,
  settingsTreeProvider: SettingsTreeProvider,
  actionsViewProvider: ActionsViewProvider,
  compilationTreeProvider: CompilationTreeProvider
) {
  const isInternal = isInternalCompiler(context);
  settingsTreeProvider.settings['Compiler'] = [
    new BooleanTreeItem('Use dynamic compilation', isInternal, vscode.TreeItemCollapsibleState.None)
  ];

  actionsViewProvider.toggleInternalCompiler(isInternal);
  compilationTreeProvider.toggleInternalCompiler(isInternal);

  context.subscriptions.push(vscode.commands.registerCommand("bevara-compiler.use-dynamic-compilation", async (item: BooleanTreeItem) => {
    if (item.boolValue == undefined) return;
    settingsTreeProvider.toggleBoolean(item);
    setInternalCompiler(context, item.boolValue);
    actionsViewProvider.toggleInternalCompiler(item.boolValue);
    compilationTreeProvider.toggleInternalCompiler(item.boolValue);
  }));
}

function createTerminal() {
  const writeEmitter = new vscode.EventEmitter<string>();
  const pty = {
    onDidWrite: writeEmitter.event,
    open: () => { /* noop*/ },
    close: () => { /* noop*/ },
    handleInput: (data: string) => { /* noop*/ }
  };
  const terminal = vscode.window.createTerminal({ name: `Bevara comiler`, pty });
  terminal.show();
  return writeEmitter;
}


export function compileProject(
  folder: string,
  output: string
) {

  function addFolderToZip(zip: AdmZip, folderPath: string, baseFolder = "") {
    const items = fs.readdirSync(folderPath);

    items.forEach(item => {
      const fullPath = path.join(folderPath, item);

      // Skip hidden folders/files (starting with a dot)
      if (item.startsWith('.')) {
        return;
      }

      const stats = fs.statSync(fullPath);

      if (stats.isDirectory()) {
        // Recursively add subfolders
        addFolderToZip(zip, fullPath, path.join(baseFolder, item));
      } else {
        // Add file to zip
        zip.addLocalFile(fullPath, baseFolder);
      }
    });
  }
  const buildPath = path.join(output, "build");
  fs.mkdirSync(buildPath);
  fs.writeFileSync(path.join(buildPath, "STATUS"), "inprogress");

  const zip = new AdmZip();
  addFolderToZip(zip, folder);
  const zipBuffer = zip.toBuffer();


  const form = new FormData();
  form.append('file', zipBuffer, {
    filename: 'compressed-folder.zip',
    contentType: 'application/zip',
  });

  // Get the headers required for the multipart form data
  const formHeaders = form.getHeaders();

  const options = {
    hostname: "bevara.ddns.net",
    //hostname: config.serverUrl, // e.g. 'example.com'
    //hostname: "192.168.1.120", // e.g. 'example.com'
    //hostname: "localhost", // e.g. 'example.com'
    path: "/api/file",    // e.g. '/upload'
    //port: 8000,
    method: 'POST',
    headers: formHeaders,
  };

  const writeEmitter = createTerminal();

  //const req = https.request(options, (res) => {
  const req = https.request(options, (res) => {
    res.setEncoding('utf8');

    function save_wasm(path: string, data: string) {
      const buffer = Buffer.from(data, 'base64');

      // Sauvegarder le fichier binaire
      fs.writeFile(path, buffer, (err) => {
        if (err) {
          console.error('Error saving the binary file:', err);
        } else {
          console.log('Binary file successfully saved.');
        }
      });
    }

    function save_terminal(path: string, data: string) {
      // Sauvegarder le fichier binaire
      fs.writeFile(path, data, (err) => {
        if (err) {
          console.error('Error saving the terminal file:', err);
        } else {
          console.log('Binary file successfully saved.');
        }
      });
    }

    function parseSSEData(sseData: string) {
      // Split the SSE data by newline and filter out empty lines
      const lines = sseData.split('\n').filter(line => line.trim() !== '');

      // Process each line that starts with 'data:'
      const messages = lines
        .filter(line => line.startsWith('data:'))
        .map(line => line.replace(/^data:\s*/, '')); // Remove 'data: ' prefix

      return messages;
    }

    let step = 0;
    let current_path: string | null = null;
    let current_filename: string | null = null;
    let current_filedata: string | null = null;
    let current_step: string | null = null;
    let build_returncode = 0;

    res.on('data', (chunk) => {
      const messages = parseSSEData(chunk);

      for (const message of messages) {
        if (message.startsWith('step: ')) {
          step++;
          const name = message.replace("step: ", "");
          current_step = name;
          current_path = path.join(buildPath, step.toString());
          fs.mkdirSync(current_path);
          fs.writeFile(path.join(current_path, "NAME"), name, (err) => {
            vscode.commands.executeCommand('bevara-compiler.refreshEntry');
            if (err) {
              vscode.window.showErrorMessage(message);
            }
          });
        } else if (message.startsWith('terminal: ')) {
          const term = message.replace("terminal: ", "");
          writeEmitter.fire(term + "\r\n");
          if (current_path) {
            fs.writeFile(path.join(current_path, "TERMINAL"), term + "\n", { flag: 'a' }, (err) => {
              if (err) {
                vscode.window.showErrorMessage(message);
              }
            });
          }
        } else if (message.startsWith('returncode: ')) {
          const returncode = message.replace('returncode: ', "");
          build_returncode |= Number(returncode);
          if (current_path) {
            fs.writeFile(path.join(current_path, "RETURNCODE"), returncode, (err) => {
              vscode.commands.executeCommand('bevara-compiler.refreshEntry');
              if (err) {
                vscode.window.showErrorMessage(message);
              }
            });
          }else{
            fs.writeFile(path.join(buildPath, "RETURNCODE"), returncode, (err) => {
              vscode.commands.executeCommand('bevara-compiler.refreshEntry');
              if (err) {
                vscode.window.showErrorMessage(message);
              }
            });
          }

          if (current_filename != null && current_filedata != null) {
            const buffer = Buffer.from(current_filedata, 'base64');
            fs.writeFile(path.join(output, current_filename), buffer, (err) => {
              if (err) {
                vscode.window.showErrorMessage(message);
              }
            });
          }

          current_path = null;
          current_filename = null;
          current_filedata = null;
        } else if (message.startsWith('error: ')) {
          const errMsg = message.replace('error: ', "");
          writeEmitter.fire(errMsg + "\r\n");
          if (current_path) {
            fs.writeFile(path.join(current_path, "ERROR"), errMsg, (err) => {
              if (err) {
                vscode.window.showErrorMessage(message);
              }
            });
          }
        } else if (message.startsWith('name: ')) {
          current_filename = message.replace('name: ', "");
          current_filedata = "";
        } else if (message.startsWith('base64-data: ')) {
          const data = message.replace('base64-data: ', "");
          if (current_filedata != null) {
            current_filedata += data;
          }
        } else if (current_filedata != null) {
          current_filedata += message;
        } else {
          vscode.window.showErrorMessage(message);
        }
      }
    });

    res.on('end', () => {
      fs.writeFileSync(path.join(buildPath, "STATUS"), "completed");
      fs.writeFileSync(path.join(buildPath, "RETURNCODE"), build_returncode.toString());
      vscode.window.showInformationMessage("Compilation ended successfully!");
    });
  });

  req.on('error', (e) => {
    vscode.window.showErrorMessage(e.message);
  });

  form.pipe(req);
}

export function rootPath() {
  return (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
    ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;
}

export function getCompilationOutputPath(fullpath: string) {
  const bevaraPath = path.join(fullpath, ".bevara");

  if (!fs.existsSync(bevaraPath)) {
    fs.mkdirSync(bevaraPath);
  }

  const attempts: number[] = [];

  const items = fs.readdirSync(bevaraPath);
  for (const item of items) {
    const fullPath = path.join(bevaraPath, item);
    if (item.startsWith('.')) {
      continue;
    }

    const stats = fs.statSync(fullPath);
    const j = Number(item);
    if (stats.isDirectory() && !Number.isNaN(j)) {
      attempts.push(j);
    }
  }

  const newAttemptsId = attempts.length > 0 ? Math.max(...attempts) + 1  :1;
  const newPath = path.join(bevaraPath, newAttemptsId.toString());
  fs.mkdirSync(newPath);
  return newPath;
}