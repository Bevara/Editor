
import * as fs from 'fs';
import * as path from 'path';
import { StatusAndConclusion } from '../actions/icons';

export class InternalJob {
  public name = "";
  public steps : string[] = [];
  private _fullPath :string;
  public job : StatusAndConclusion ={"status":null, conclusion : null};

  constructor(name:string, fullPath : string) {
    this.name = name;
    this._fullPath = fullPath;
    const statusPath = path.join(this._fullPath, "STATUS");
    const conclusionPath = path.join(this._fullPath, "RETURNCODE");
    
    if (fs.existsSync(statusPath)) {
      const status = fs.readFileSync(statusPath, 'utf8');
      this.job.status = status;

      if (status == "completed" && fs.existsSync(statusPath)){
        const returnCode = fs.readFileSync(conclusionPath, 'utf8');
        this.job.conclusion = Number(returnCode) == 0 ? "success" : "failure";
      }

    }
    
    const items = fs.readdirSync(this._fullPath);
		for (const item of items) {
			const fullPath = path.join(this._fullPath, item);
			if (item.startsWith('.')) {
				continue;
			}

			const stats = fs.statSync(fullPath);
			if (stats.isDirectory()) {
        this.steps.push(fullPath);
			}
		}
  }

}
