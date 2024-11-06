import * as fs from 'fs';
import * as path from 'path';
import { InternalJob } from "./internalJob";
import { StatusAndConclusion } from '../actions/icons';

export class InternalRun {
	public status: string | null = null;
	public conclusion: string | null = null;
	private _jobs: Promise<InternalJob[]> | undefined;
	private _path: string;

	protected _run: StatusAndConclusion ={"status":null, conclusion : null};

	constructor(fullpath: string, readonly run_id:string) {
		this._path = fullpath;
		const statusPath = path.join(fullpath, "build", "STATUS");
		const returnCodePath = path.join(fullpath, "build",  "RETURNCODE");
		
		if (fs.existsSync(statusPath)){
			const status = fs.readFileSync(statusPath, 'utf8');
			this._run.status = status;
		}

		if (fs.existsSync(returnCodePath)){
			const returnCode = fs.readFileSync(returnCodePath, 'utf8');
			this._run.conclusion = Number(returnCode) == 0 ? "success" : "failure";
		}
	}

	async fetchJobs(): Promise<InternalJob[]> {

		const jobs: InternalJob[] = [];
		const items = fs.readdirSync(this._path);
		for (const item of items) {
			const fullPath = path.join(this._path, item);
			if (item.startsWith('.')) {
				continue;
			}

			const stats = fs.statSync(fullPath);
			if (stats.isDirectory()) {
				jobs.push(new InternalJob(item, this.run_id, fullPath));
			}
		}

		return jobs;
	}


	get run(): StatusAndConclusion {
		return this._run;
	}

	jobs(): Promise<InternalJob[]> {
		if (!this._jobs) {
			this._jobs = this.fetchJobs();
		}

		return this._jobs;
	}

	contextValue(): string {
		const contextValues = ["r_internal"];
		const completed = this._run.status === "completed";
		contextValues.push(completed ? "rerunnable" : "cancelable");

		if (completed) {
			contextValues.push("completed");
		}

		return contextValues.join(" ");
	}
}

export class InternalRunAttempt {
	public readonly attempt: number;

	constructor(attempt: number) {
		this.attempt = attempt;
	}
}