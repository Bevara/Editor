
import * as fs from 'fs';
import * as path from 'path';
import { StatusAndConclusion } from '../actions/icons';

export class InternalJob {
  public steps : string[] = [];
  public job : StatusAndConclusion ={"status":null, conclusion : null};

  constructor(readonly name:string, readonly run_id:string, readonly fullPath : string) {
    this.name = name;
    const statusPath = path.join(this.fullPath, "STATUS");
    const conclusionPath = path.join(this.fullPath, "RETURNCODE");
    
    if (fs.existsSync(statusPath)) {
      const status = fs.readFileSync(statusPath, 'utf8');
      this.job.status = status;

      if (status == "completed" && fs.existsSync(statusPath)){
        const returnCode = fs.readFileSync(conclusionPath, 'utf8');
        this.job.conclusion = Number(returnCode) == 0 ? "success" : "failure";
      }

    }
    
    const items = fs.readdirSync(this.fullPath);
		for (const item of items) {
			const fullPath = path.join(this.fullPath, item);
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
