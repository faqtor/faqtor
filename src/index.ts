import { exec, spawn } from "child_process";
import * as fs from "fs";
import glob from "glob";
import * as path from "path";
import stringArgv from "string-argv";
import * as util from "util";
import which from "which";

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
    run(argv?: string[]): Promise<Error>;
    factor(input: Domain, output?: Domain): IFactor;
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

interface IReportedError extends Error {
    reported: boolean;
}

const isReported = (e: Error): e is IReportedError => !!((e as IReportedError).reported);

class ErrorNothingToDo extends Error {
    constructor(public nothingToDo: boolean = true) {
        super("");
    }
}

const cmdPrefix = "--COMMAND:";
const tskPrefix = "--TASK:   ";

export class Factor implements IFactor {
    private name: string = null;
    private taskInfo: string = null;

    constructor(
        readonly Input: Domain,
        readonly Output: Domain,
        private runf: (argv?: string[]) => Promise<Error>,
    ) {}

    public async run(argv?: string[]): Promise<Error> {
        if (this.name) {
            console.log("\n" + `==<${this.name}>`);
        }
        if (this.taskInfo) {
           console.log(`${tskPrefix} ${this.taskInfo}`);
        }
        const err = await this.runf(argv);
        if (this.name) {
            if (err) {
                if (!isReported(err)) {
                    (err as IReportedError).reported = true;
                    if (err instanceof ErrorNothingToDo) {
                        console.log(`~~NOTHING TO DO FOR <${this.name}>`);
                    } else {
                        console.log(`~~ERROR IN <${this.name}>:`, err);
                    }
                }
            } else {
                console.log(`~~<${this.name}> SUCCESS`);
            }
        }
        return err;
    }

    public factor(input: Domain, output?: Domain): IFactor {
        return factor(this, input, output);
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

    const run = async () => {
        // always run factor if no input globs:
        if (!inp.length) { return await f.run(); }

        const filesIn = await runGlobs(inp, {});
        if (filesIn.Errs.length) {
            printErrors(filesIn.Errs);
        }

        // nothing to do if has globs but no files:
        if (!filesIn.Matches.length) { return new ErrorNothingToDo(); }

        // always run factor if no output files:
        if (!outp.length) { return await f.run(filesIn.Matches); }

        const filesOut = await runGlobs(outp, {});
        if (filesOut.Errs.length) {
            printErrors(filesOut.Errs);
        }

        // always run factor if has output globs but no files:
        if (!filesOut.Matches.length) { return await f.run(filesIn.Matches); }

        const accOut = await Promise.all(filesOut.Matches.map((x) => pathExists(x)));

        // always run factor if some of output files do not exist:
        if (accOut.filter((x) => !x).length) { return await f.run(filesIn.Matches); }

        const statsIn = await Promise.all(filesIn.Matches.map(async (x) => fileStat(x)));
        const statsOut = await Promise.all(filesOut.Matches.map(async (x) => fileStat(x)));

        const inModified = Math.max(...statsIn.map((x) => x.mtime.getTime()));
        const outModified = Math.max(...statsOut.map((x) => x.mtime.getTime()));
        if (inModified > outModified) { return await f.run(filesIn.Matches); }
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
    console.log(cmdPrefix, [extCmd].concat(args).join(" "));
    return await new Promise((resolve) => {
        const proc = spawn(extCmd, args, {stdio: [process.stdin, process.stdout, process.stderr]});
        proc.on("exit", (code) => resolve(code ? new ErrorNonZeroExitCode(extCmd, code) : null));
        proc.on("error", (err) => resolve(err));
    });
}

export const func = (
    f: (argv?: string[]) => Promise<Error>,
    input: Domain = null, output: Domain = null): IFactor => new Factor(input, output, f);

export const cmd = (s: string): IFactor => {
    const argv = stringArgv(s);
    const run = async (args?: string[]) => {
        args = args ? argv.concat(args) : argv;
        if (!args.length) { return null; }
        let err: Error = null;
        let rpath: string;
        [rpath, err] = await resolveBin(args[0]);
        if (!err) {
            args[0] = rpath;
            return await runCommand(process.argv[0], ...args);
        }
        [err, rpath] = await new Promise((resolve) => {
            which(args[0], (e, p) => resolve([e, p]));
        });
        if (!err) {
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
        depends = depends.concat(norm(f.Input));
        results = results.concat(norm(f.Output));
    }
    const run  = async () => {
        let err: Error = null;
        for (const f of factors) {
            err = await f.run();
            if (err && !(err instanceof ErrorNothingToDo)) { return err; }
        }
        return err;
    };
    return new Factor(depends, results, run);
};

export const cmds = (...c: string[]): IFactor => seq(...c.map((s) => cmd(s)));

export enum Mode {
    production,
    development,
}

export let production = true;
export let mode = Mode.production;

if (typeof (global as any).FAQTOR_MODE !== "undefined") {
    const m = (global as any).FAQTOR_MODE;
    const prodSyn = {prod: 1, production: 1};
    production = m in prodSyn;
    mode = m in prodSyn ? Mode.production : Mode.development;
}
