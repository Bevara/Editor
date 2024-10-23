import * as vscode from "vscode";
import * as AdmZip from 'adm-zip';
import * as https from 'https';
import * as http from 'http';
import * as FormData from 'form-data';
import * as fs from 'fs';

import { config } from '../util';

import { WorkflowRunCommandArgs } from "../workflows/workflowRunNode";
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
  path: string
) {
  const zip = new AdmZip();
  zip.addLocalFolder(path);
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

    function save_wasm(path:string, data:string){
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

    function parseSSEData(sseData:string) {
      // Split the SSE data by newline and filter out empty lines
      const lines = sseData.split('\n').filter(line => line.trim() !== '');
  
      // Process each line that starts with 'data:'
      const messages = lines
          .filter(line => line.startsWith('data:'))
          .map(line => line.replace(/^data:\s*/, '')); // Remove 'data: ' prefix
  
      return messages;
    }

    const wasms :any = {};
    let terminal_data = '';

    res.on('data', (chunk) => {
      const messages = parseSSEData(chunk);
      let wasm_file ='';
      let wasm_data ='';
      let is_wasm_data_buffer =false;
      messages.forEach((message)=>{
        if (message.startsWith('terminal: ')) {
          writeEmitter.fire(message.replace("terminal: ", "")+"\r\n");
          terminal_data += message.replace("terminal: ", "")+"\n";
          is_wasm_data_buffer = false;
        }else if (message.startsWith('wasm-file: ')) {
          wasm_file = message.replace("wasm-file: ", "");
          wasms[wasm_file] = '';
          is_wasm_data_buffer = false;
        }else if (message.startsWith('wasm-data: ')) {
          wasm_data = message.replace("wasm-data: ", "");
          wasms[wasm_file] = wasm_data;
          is_wasm_data_buffer = true;
        } else if (is_wasm_data_buffer) {
          wasms[wasm_file] += message;
        }else{
          vscode.window.showErrorMessage(message);
        }
      });
    });

    res.on('end', () => {
      for (const [key, value] of Object.entries(wasms)) {
        save_wasm(path + '/.bevara/' + key, value as string);
      }
      //fs.writeFileSync(path+"/.bevara/test.wasm", data, 'utf8');
      console.log('Response from server:', wasms);
    });
  });

  req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
  });

  form.pipe(req);
}