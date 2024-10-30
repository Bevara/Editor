
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
    
    if (fs.existsSync(statusPath)) {
      const returnCode = fs.readFileSync(statusPath, 'utf8');
      this.job.status = returnCode == '0'? "completed" : "in_progress";
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
