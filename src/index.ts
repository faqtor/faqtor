import { exec, spawn, ChildProcessByStdio } from "child_process";
import * as fs from "fs";
import glob from "glob";
import * as path from "path";
import stringArgv from "string-argv";
import * as util from "util";
import which from "which";
import * as chalk_ from "chalk";

const chalk = chalk_.default;


class ErrorPathDoesNotExists extends Error {
    constructor(p: string) {
        super(`Path ${p} does not exist`);
    }
}

const pathExists = (p: string) => new Promise<boolean>((resolve) => {
    fs.access(p, (err) => resolve(err === null));
});

const runExternal = (extCmd: string): Promise<[string, Error]> => new Promise((resolve) => {
    exec(extCmd, (err, stdout) => {
        resolve([stdout.trim(), err]);
    });
});

const resolveBin = async (name: string): Promise<[string, Error]> => {
    const [binsPath, err] = await runExternal("npm bin");
    if (err) {
        return ["", err];
    }

    const binPath = path.join(binsPath, name);
    if (!await pathExists(binPath)) {
        return ["", new ErrorPathDoesNotExists(binPath)];
    }
    return [binPath, null];
};

interface IGlobMatch {
    Errs:    Error[];
    Matches: string[];
}

const runGlob = async (pattern: string, options: glob.IOptions) => new Promise<IGlobMatch>((resolve) => {
    glob(pattern, options, (err, matches) => resolve({Errs: err ? [err] : null, Matches: matches}));
});

const runGlobs = async (globs: string[], options: glob.IOptions) => {
    const r = await Promise.all(globs.map((g) => runGlob(g, options)));
    return {
        Errs: [].concat(r.filter((x) => !!x.Errs)),
        Matches: [].concat(...r.map((x) => x.Matches)),
    };
};

export type Domain = null | string | string[];

export interface IFactor {
    readonly Input: Domain;
    readonly Output: Domain;
    readonly MustRun: boolean;
    run(argv?: string[]): Promise<Error>;
    factor(input: Domain, output?: Domain): IFactor;
    must(): IFactor;
}

const norm = (d: Domain): string[] => {
    const dom = !d ? [] : typeof d === "string" ? [d] : d;
    if (dom.length < 2) { return dom; }
    const tab: {[name in string]: boolean} = {};
    for (const s of dom) {
        tab[s] = true;
    }
    return Object.getOwnPropertyNames(tab);
};

const fileStat = util.promisify(fs.stat);

function printErrors(errs: Error[]) {
    for (const err of errs) {
        console.error(err);
    }
}

export interface IReportedError extends Error {
    reported: boolean;
}

export const isReported = (e: Error): e is IReportedError => !!((e as IReportedError).reported);

export class ErrorNothingToDo extends Error implements IReportedError {
    constructor(public nothingToDo: boolean = true, public reported: boolean = true) {
        super("");
    }
}

export const isNothingToDo = (e: Error): e is ErrorNothingToDo => !!((e as ErrorNothingToDo).nothingToDo);

const trgPrefix =      chalk.blue.bold("TARGET:   ");
const cmdPrefix =      chalk.gray.bold("COMMAND:  ");
const tskPrefix =     chalk.green.bold("TASK:     ");
const sccPrefix =      chalk.blue.bold("SUCCEED:  ");
const errPrefix = chalk.redBright.bold("ERROR IN: ");
const notPrefix =      chalk.blue.bold("NO TASKS: ");

export class Factor implements IFactor {
    private name: string = null;
    private taskInfo: string = null;
    private mustRun: boolean = false;

    constructor(
        readonly Input: Domain,
        readonly Output: Domain,
        private runf: (argv?: string[]) => Promise<Error>,
    ) {}

    public async run(argv?: string[]): Promise<Error> {
        if (this.name) {
            console.log("\n" + trgPrefix + this.name);
        }
        if (this.taskInfo) {
           console.log(`${tskPrefix}${this.taskInfo}`);
        }
        const err = await this.runf(argv);
        if (this.name) {
            if (err) {
                if (err instanceof ErrorNothingToDo) {
                    console.log(`${notPrefix}${this.name}`);
                } else if (!isReported(err)) {
                    (err as IReportedError).reported = true;
                    console.log(`${errPrefix}${this.name}, ${err}`);
                }
            } else {
                console.log(sccPrefix + this.name);
            }
        }
        return err;
    }

    public factor(input: Domain, output?: Domain): IFactor {
        return factor(this, input, output);
    }

    public get MustRun(): boolean {
        return this.mustRun;
    }

    public must(): IFactor {
        this.mustRun = true;
        return this;
    }

    public named(name: string) { // DO NOT CALL THIS INSIDE FAQTOR LIBRARY!
        this.name = name;
        return this;
    }

    public task(info: string) { // DO NOT CALL THIS INSIDE FAQTOR LIBRARY!
        this.taskInfo = info;
        return this;
    }
}

export function factor(f: IFactor, input: Domain, output: Domain = null): IFactor {
    const inp = norm(norm(input).concat(norm(f.Input)));
    const outp = norm(norm(output).concat(norm(f.Output)));

    const run = async (argv?: string[]) => {
        // always run factor if no input globs:
        if (!inp.length) { return await f.run(argv); }

        const filesIn = await runGlobs(inp, {});
        if (filesIn.Errs.length) {
            printErrors(filesIn.Errs);
        }

        // nothing to do if has globs but no files:
        if (!filesIn.Matches.length) { return new ErrorNothingToDo(); }

        // always run factor if no output files:
        if (!outp.length) { return await f.run(argv); }

        const filesOut = await runGlobs(outp, {});
        if (filesOut.Errs.length) {
            printErrors(filesOut.Errs);
        }

        // always run factor if has output globs but no files:
        if (!filesOut.Matches.length) { return await f.run(argv); }

        const statsIn = await Promise.all(filesIn.Matches.map(async (x) => fileStat(x)));
        const statsOut = await Promise.all(filesOut.Matches.map(async (x) => fileStat(x)));

        const inModified = Math.max(...statsIn.map((x) => x.mtime.getTime()));
        const outModified = Math.max(...statsOut.map((x) => x.mtime.getTime()));
        if (inModified > outModified) { return await f.run(argv); }
        return new ErrorNothingToDo();
    };

    return new Factor(inp, outp, run);
}

class ErrorNonZeroExitCode extends Error {
    constructor(cmdName: string, code: number) {
        super(`Process ${cmdName} exited with code ${code}`);
    }
}

async function runCommand(extCmd: string, ...args: string[]): Promise<Error> {
    return await new Promise((resolve) => {
        let proc: ChildProcessByStdio<null, null, null> = null;
        if (!/^win/.test(process.platform)) { // linux
            proc = spawn(extCmd, args, {stdio: [process.stdin, process.stdout, process.stderr]});
        } else { // windows
            proc = spawn('cmd', ['/s', '/c', extCmd, ...args],
                {stdio: [process.stdin, process.stdout, process.stderr]});
        }
        proc.on("exit", (code) => resolve(code ? new ErrorNonZeroExitCode(extCmd, code) : null));
        proc.on("error", (err) => resolve(err));
});
}

export const func = (
    f: (argv?: string[]) => Promise<Error>,
    input: Domain = null, output: Domain = null): IFactor => new Factor(input, output, f);

export const cmd = (s: string): IFactor => {
    s = s.trim();
    const argv = stringArgv(s);
    const run = async (args?: string[]) => {
        args = args ? argv.concat(args) : argv;
        if (!args.length) { return null; }
        let err: Error = null;
        let rpath: string;
        [rpath, err] = await resolveBin(args[0]);
        if (!err) {
            const extCmd = rpath;
            const intCmd = args[0];
            const txt = (extCmd + " " + s.replace(intCmd, "")).trim()
            console.log(cmdPrefix + txt);
            return await runCommand(rpath, ...args.slice(1));
        }
        [err, rpath] = await new Promise((resolve) => {
            which(args[0], (e, p) => resolve([e, p]));
        });
        if (!err) {
            const extCmd = rpath;
            const intCmd = args[0];
            const txt = (extCmd + " " + s.replace(intCmd, "")).trim()
            console.log(cmdPrefix + txt);
            return await runCommand(rpath, ...args.slice(1));
        }
        return err;
    };

    return new Factor(null, null, run);
};

export const seq = (...factors: IFactor[]): IFactor => {
    let depends: Domain = [];
    let results: Domain = [];
    for (const f of factors) {
        depends = norm(depends.concat(norm(f.Input)));
        results = norm(results.concat(norm(f.Output)));
    }
    const run  = async (argv?: string[]) => {
        let err: Error = null;
        let i = 0;
        for (; i < factors.length; i++) {
            const f = factors[i];
            if (err && !isNothingToDo(err)) {
                if (f.MustRun) await f.run();
            } else {
                err = await f.run();
            }
        }

        return err;
    };
    return new Factor(depends, results, run);
};

export const cmds = (...c: string[]): IFactor => seq(...c.map((s) => cmd(s)));

const errorsToString = (errors: Error[]): string => {
    let msg = "Errors occured:\n";
    for (const e of errors) {
        msg += `\t${e}\n`
    }
    return msg;
}

class CompoundError extends Error {
    constructor(errors: Error[]) {
        super(errorsToString(errors));
    }
}

export const all = (...tsk: IFactor[]): IFactor => {
    const run = async (argv?: string[]): Promise<Error> => {
        let result = await Promise.all(tsk.map((t) => t.run(argv)));
        result = result.filter((e) => e && !isReported(e));
        if (result.length) return new CompoundError(result);
        return null;
    }

    return func(run);
}

export let production = true;
export let mode = "production";

export const setMode = (name?: string) => {
    if (name) {
        mode = name;
        const prodSyn = {prod: 1, production: 1};
        production = mode in prodSyn;
    }    
}

setMode((global as any).FAQTOR_MODE);