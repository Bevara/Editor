import * as fs from 'fs';
import * as path from 'path';
import { InternalJob } from "./internalJob";

export class InternalRun {
	public status: string | null = null;
	public conclusion: string | null = null;
	private _jobs: Promise<InternalJob[]> | undefined;
	private _path: string;

	protected _run: InternalRun;

	constructor(path: string) {
		this._run = this;
		this._path = path;
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
				jobs.push(new InternalJob(item, fullPath));
			}
		}

		return jobs;
	}


	get run(): InternalRun {
		return this._run;
	}

	jobs(): Promise<InternalJob[]> {
		if (!this._jobs) {
			this._jobs = this.fetchJobs();
		}

		return this._jobs;
	}
}

export class InternalRunAttempt {
	public readonly attempt: number;

	constructor(attempt: number) {
		this.attempt = attempt;
	}
}