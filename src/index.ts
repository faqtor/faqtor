import glob from "glob";
import * as fs from "fs";
import * as util from "util";
import stringArgv from "string-argv";
import which from "which";
import { execFile } from "child_process";

const resolveBin = require("resolve-bin") as
    (name: string, cb: (err: Error, rpath: string) => void) => void;

interface IGlobMatch {
    Errs:    Error[];
    Matches: string[];
}

const runGlob = async (pattern: string, options: glob.IOptions) => new Promise<IGlobMatch>((resolve) => {
    glob(pattern, options, (err, matches) => resolve({Errs: err ? [err] : null, Matches: matches}))
})

const runGlobs = async (globs: string[], options: glob.IOptions) => {
    const r = await Promise.all(globs.map((g) => runGlob(g, options)));
    return {
        Errs: [].concat(r.filter((x) => !!x.Errs)),
        Matches: [].concat(...r.map((x) => x.Matches)),
    };
}

export type Domain = null | string | string[];

export interface IFactor {
    readonly Files: Domain;
    run(argv?: string[]): Promise<Error>;
}

const normalizeDomain = (d: Domain): string[] => d === null ? [] : typeof d === "string" ? [d] : d;

const fileStat = util.promisify(fs.stat);

function printErrors(errs: Error[]) {
    for (const err of errs) {
        console.error(err);
    }
}

class Factor implements IFactor {
    constructor(readonly Files: Domain, run: (argv?: string[]) => Promise<Error>) {
        this.run = run;
    }
    run(argv?: string[]): Promise<Error> { return null; }
}

export function factor(f: IFactor, input: Domain, output: Domain = null): IFactor {
    const inp = normalizeDomain(input);
    const outp = normalizeDomain(output);

    const run = async () => {
        if (!inp.length) { return await f.run(); }
        const filesIn = await runGlobs(inp, {});
        if (filesIn.Errs.length) {
            printErrors(filesIn.Errs);
        }
        if (!filesIn.Matches.length) { return null; }
        if (!outp.length) { return await f.run(filesIn.Matches); }
        const accOut = await Promise.all(outp.map((x) => new Promise<boolean>((resolve) => {
            fs.access(x, (err) => resolve(err === null))
        })));
        if (accOut.filter((x) => !x).length) { return await f.run(filesIn.Matches); }

        const statsIn = await Promise.all(filesIn.Matches.map(async (x) => fileStat(x)));
        const statsOut = await Promise.all(outp.map(async (x) => fileStat(x)));

        const inModified = Math.max(...statsIn.map((x) => x.mtime.getTime()));
        const outModified = Math.max(...statsOut.map((x) => x.mtime.getTime()));
        if (inModified > outModified) { return await f.run(filesIn.Matches); }
        return null;
    }

    return new Factor(outp, run);
}

async function runCommand(cmd: string, ...args: string[]): Promise<Error> {
    return await new Promise((resolve) => {
        const proc = execFile(cmd, args);
        proc.stdout.on('data', function(data) {
            console.log(data.toString()); 
        });
        proc.stderr.on('data', function(data) {
            console.error(data.toString()); 
        });
        proc.on("exit", () => resolve(null));
        proc.on("error", (err) => resolve(err));
    })
}

export const cmd = (s: string): IFactor => {
    const argv = stringArgv(s);
    const run = async () => {
        if (!argv.length) { return null; }
        let err: Error = null;
        let rpath: string;
        [err, rpath] = await new Promise((resolve) => {
            resolveBin(argv[0], (err, rpath) => resolve([err, rpath]))
        });
        if (!err) {
            argv[0] = rpath;
            return await runCommand(process.argv[0], ...argv);
        }
        [err, rpath] = await new Promise((resolve) => {
            which(argv[0], (err, rpath) => resolve([err, rpath]))
        });
        if (!err) {
            return await runCommand(rpath, ...argv.slice(1));
        }
        return err;
    }
    
    return new Factor(null, run);
}

export const seq = (...factors: IFactor[]): IFactor => {
    let files = null;
    if (factors.length) {
        files = factors[factors.length-1].Files;
    }
    const run  = async () => {
        for (const f of factors) {
            const err = await f.run();
            if (err) { return err; }
        }
        return null;
    }
    return new Factor(files, run);
}