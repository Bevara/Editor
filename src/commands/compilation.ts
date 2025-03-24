import * as vscode from "vscode";
import * as AdmZip from 'adm-zip';
import * as https from 'https';
import * as http from 'http';
import * as FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

import { DebugCompilationTreeItem, DynamicCompilationTreeItem, SettingsExplorerNode, SettingsTreeProvider } from "../sdk/settingsTreeProvider";
import { isDebugCompiler, isInternalCompiler, setDebugCompiler, setInternalCompiler } from "../sdk/options";
import { ActionsViewProvider } from "../sdk/actionsWebviewProvider";
import { CompilationTreeProvider } from "../sdk/compilationTreeProvider";
import { checkGlobalStorateInitialized } from "../filters/utils";
import { getFilterDesc, getJSONNameFromCmake } from "../filters/cmake";
import { deleteLibrary } from "../filters/libraries";
import { BevaraUnpreservedEditorProvider } from "../editors/BevaraUnpreservedEditor";

let terminal :vscode.Terminal | null= null;

export function registerDynamicCompilation(context: vscode.ExtensionContext,
  settingsTreeProvider: SettingsTreeProvider,
  actionsViewProvider: ActionsViewProvider,
  compilationTreeProvider: CompilationTreeProvider
) {
  const isInternal = isInternalCompiler(context);

  settingsTreeProvider.settings['Compiler'] = [
    new DynamicCompilationTreeItem('Use dynamic compilation', isInternal, vscode.TreeItemCollapsibleState.None)
  ];

  if (isInternal == true) {
    const isDebug = isDebugCompiler(context);
    settingsTreeProvider.settings['Compiler'].push(
      new DebugCompilationTreeItem('Compile with debug information', isDebug, vscode.TreeItemCollapsibleState.None)
    );
  }


  actionsViewProvider.toggleInternalCompiler(isInternal);
  compilationTreeProvider.toggleInternalCompiler(isInternal);

  context.subscriptions.push(vscode.commands.registerCommand("bevara-compiler.use-dynamic-compilation", async (item: DynamicCompilationTreeItem | DebugCompilationTreeItem) => {
    if (item.boolValue == undefined) return;

    settingsTreeProvider.toggleBoolean(item);
    setInternalCompiler(context, item.boolValue);
    actionsViewProvider.toggleInternalCompiler(item.boolValue);
    compilationTreeProvider.toggleInternalCompiler(item.boolValue);

    if (item.boolValue == false) {
      settingsTreeProvider.settings['Compiler'].pop();
    } else {
      const isDebug = isDebugCompiler(context);
      settingsTreeProvider.settings['Compiler'].push(
        new DebugCompilationTreeItem('Compile with debug information', isDebug, vscode.TreeItemCollapsibleState.None)
      );
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand("bevara-compiler.use-debug-compilation", async (item: DynamicCompilationTreeItem | DebugCompilationTreeItem) => {
    if (item.boolValue == undefined) return;
    settingsTreeProvider.toggleBoolean(item);
    setDebugCompiler(context, item.boolValue);
  }));
}

function createTerminal() {
  if (terminal != null){
    terminal.dispose();
  }

  const writeEmitter = new vscode.EventEmitter<string>();
  const pty = {
    onDidWrite: writeEmitter.event,
    open: () => { /* noop*/ },
    close: () => { /* noop*/ },
    handleInput: (data: string) => { /* noop*/ }
  };
  terminal = vscode.window.createTerminal({ name: `Compilation terminal`, pty });
  terminal.show();
  return writeEmitter;
}

export function compressProject(
  folder: string
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

  const zip = new AdmZip();
  addFolderToZip(zip, folder);
  return zip.toBuffer();
}

export function compileProject(
  zipBuffer: Buffer,
  input : string,
  output: string,
  debug: boolean
) {
  const buildPath = path.join(output, "build");
  fs.mkdirSync(buildPath);
  fs.writeFileSync(path.join(buildPath, "STATUS"), "inprogress");

  const source_path = path.join(buildPath, "source.zip");

  fs.writeFile(source_path, zipBuffer, function (err) {
    if (err) {
      vscode.window.showErrorMessage(err.message);
    }
  });


  const form = new FormData();
  form.append('file', zipBuffer, {
    filename: 'compressed-folder.zip',
    contentType: 'application/zip',
  });
  form.append('debug', debug ? "True" : "False");
  form.append('folder', input);

  // Get the headers required for the multipart form data
  const formHeaders = form.getHeaders();


  const optionsTest = {
    hostname: "192.168.1.120", // e.g. 'example.com'
    path: "/api/file",    // e.g. '/upload'
    port: 8000,
    method: 'POST',
    headers: formHeaders
  };

  const options = {
    hostname: "bevara.ddns.net",
    path: "/api/file",    // e.g. '/upload'
    method: 'POST',
    headers: formHeaders
  };

  const writeEmitter = createTerminal();

  //const req = http.request(optionsTest, (res) => {
  const req = https.request(options, (res) => {
    res.setEncoding('utf8');

    let step = 0;
    let current_path: string | null = null;
    let current_filename: string | null = null;
    let current_filesha256: string | null = null;
    let current_step: string | null = null;
    let build_returncode = 0;

    function parseSSEData(sseData: string) {
      // Split the SSE data by newline and filter out empty lines
      const lines = sseData.split('\n').filter(line => line.trim() !== '');

      // // Process each line that starts with 'data:'
      // const messages = lines
      //   .filter(line => line.startsWith('data:'))
      //   .map(line => line.replace(/^data:\s*/, '')); // Remove 'data: ' prefix

      // const remainings = lines
      //   .filter(line => !line.startsWith('data:')); // Remaining data (FIXME : should be a better parsing)

      // for (const remaining of remainings){
      //   if (current_filedata != null) {
      //     current_filedata += remaining;
      //   }
      // }

      return lines;
    }


    let remainingText = '';

    res.on('data', (chunk) => {
      const full_message = remainingText + chunk;
      const messages = full_message.match(/data:.*?\n/g) || [];
      remainingText = full_message.replace(/data:.*?\n/g, '');

      for (let message of messages) {
        if (!message.startsWith("data: ")) {
          // Wrong data
          continue;
        }

        if (!message.endsWith("\n")) {
          // Wrong data
          continue;
        }

        message = message.replace("data: ", "");
        message = message.replace("\n", "");

        if (message.startsWith('step: ')) {
          step++;
          const name = message.replace("step: ", "");
          current_step = name;
          current_path = path.join(buildPath, step.toString());
          fs.mkdirSync(current_path);
          fs.writeFile(path.join(current_path, "NAME"), name, (err) => {
            vscode.commands.executeCommand('bevara-compiler.refreshEntry');
            if (err) {
              vscode.window.showErrorMessage(err.message);
            }
          });
        } else if (message.startsWith('terminal: ')) {
          const term = message.replace("terminal: ", "");
          writeEmitter.fire(term + "\r\n");
          if (current_path) {
            fs.writeFile(path.join(current_path, "TERMINAL"), term + "\n", { flag: 'a' }, (err) => {
              if (err) {
                vscode.window.showErrorMessage(err.message);
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
                vscode.window.showErrorMessage(err.message);
              }
            });
          } else {
            fs.writeFile(path.join(buildPath, "RETURNCODE"), returncode, (err) => {
              vscode.commands.executeCommand('bevara-compiler.refreshEntry');
              if (err) {
                vscode.window.showErrorMessage(err.message);
              }
            });
          }
        } else if (message.startsWith('error: ')) {
          const errMsg = message.replace('error: ', "");
          writeEmitter.fire(errMsg + "\r\n");
          if (current_path) {
            fs.writeFile(path.join(current_path, "ERROR"), errMsg, (err) => {
              if (err) {
                vscode.window.showErrorMessage(err.message);
              }
            });
          }
        } else if (message.startsWith('name: ')) {
          current_filename = message.replace('name: ', "");
        } else if (message.startsWith('sha256: ')) {
          current_filesha256 = message.replace('sha256: ', "");
        } else if (message.startsWith('base64-data: ')) {
          const base64data = message.replace('base64-data: ', "");
          const buffer = Buffer.from(base64data, 'base64');

          const hash = crypto.createHash('sha256');
          hash.update(buffer);
          const sha256HashBuffer = hash.digest('hex');
          if (current_filesha256 && current_filesha256 != sha256HashBuffer) {
            const errorMsg = 'Error when writing file ' + current_filename + " : Wrong hash";
            writeEmitter.fire(errorMsg + "\r\n");
            if (current_path) {
              fs.writeFile(path.join(current_path, "ERROR"), "1", (err) => {
                if (err) {
                  vscode.window.showErrorMessage(err.message);
                }
              });
              fs.writeFile(path.join(current_path, "TERMINAL"), errorMsg + "\n", { flag: 'a' }, (err) => {
                if (err) {
                  vscode.window.showErrorMessage(err.message);
                }
              });
            }

          }

          if (current_filename != null) {
            fs.writeFile(path.join(output, current_filename), buffer, (err) => {
              if (err) {
                vscode.window.showErrorMessage(err.message);
              }
            });
          }
          current_filename = null;
          current_filesha256 = null;
        } else {
          vscode.window.showErrorMessage(message);
        }
      }
    });

    res.on('end', () => {
      const statusCode = res.statusCode;

      fs.writeFileSync(path.join(buildPath, "STATUS"), "completed");
      const returnCode = (build_returncode || statusCode != 200)? 1 : 0;
      fs.writeFileSync(path.join(buildPath, "RETURNCODE"), returnCode.toString() );
      if (returnCode != 0){
        vscode.window.showInformationMessage("Compilation failed!");
      }else{
        vscode.window.showInformationMessage("Compilation ended successfully!");
      }
      
    });
  });

  req.on('error', (e) => {
    fs.writeFileSync(path.join(buildPath, "STATUS"), "completed");
    fs.writeFileSync(path.join(buildPath, "RETURNCODE"), "1");
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

  const newAttemptsId = attempts.length > 0 ? Math.max(...attempts) + 1 : 1;
  const newPath = path.join(bevaraPath, newAttemptsId.toString());
  fs.mkdirSync(newPath);
  return newPath;
}

export function getCompilationStatus(directory: string) {
  const statusPath = path.join(directory, "build", 'STATUS');
  const returnPath = path.join(directory, "build", 'RETURNCODE');

  if (fs.existsSync(statusPath) &&
    fs.readFileSync(statusPath,
      { encoding: 'utf8', flag: 'r' }) == 'completed' &&
    fs.existsSync(returnPath) &&
    fs.readFileSync(returnPath,
      { encoding: 'utf8', flag: 'r' }) == '0') {
    return 'success';
  }
  return 'failed';
}

export async function getLastCompletedCompilation(directory: string) {
  const bevaraPath = path.join(directory, ".bevara");

  if (!fs.existsSync(bevaraPath)) {
    return undefined;
  }

  const items = fs.readdirSync(bevaraPath);
  const compilation_folders = [];
  for (const item of items) {
    // Skip hidden folders/files (starting with a dot)
    if (item.startsWith('.')) {
      continue;
    }

    const fullPath = path.join(bevaraPath, item);
    const stats = fs.statSync(fullPath);

    if (stats.isDirectory() && getCompilationStatus(fullPath) == 'success') {
      compilation_folders.push(parseInt(item, 10));
    }
  }

  if (compilation_folders.length == 0) {
    return undefined;
  }
  return compilation_folders.sort().reverse()[0];
}

export function saveJSONDesc(
  source: string,
  output: string
) {
  const desc = getFilterDesc(source);
  const json_name = getJSONNameFromCmake(source);
  desc.sources = path.join(output, "build", "source.zip");
  desc.build = output;
  const jsonData = JSON.stringify(desc);
  const outName = path.join(output, json_name);
  fs.writeFile(outName, jsonData, 'utf8', (err) => {
    if (err) {
      vscode.window.showErrorMessage(err.message);
    }
  });
}


export function registerInternalArtifactChangeListener(current_completed_run: number | null, directory: string, callback: (runId: number) => void, intervalMs = 5000) {
  let handle: any = null;

  async function artifactChecker() {

    const last_completed_run = await getLastCompletedCompilation(directory);
    if (!last_completed_run) {
      return;
    }

    if (last_completed_run != current_completed_run) {
      callback(last_completed_run);
    }

  }
  artifactChecker();
  handle = setInterval(async () => artifactChecker(), intervalMs);
  return handle;
}
