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

class Factor implements IFactor {
    constructor(
        readonly Input: Domain,
        readonly Output: Domain,
        private runf: (argv?: string[]) => Promise<Error>,
        private name: string = null,
    ) {}

    public async run(argv?: string[]): Promise<Error> {
        if (this.name) {
            console.log("\n" + `==<${this.name}>`);
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

        const accOut = await Promise.all(outp.map((x) => pathExists(x)));

        // always run factor if some of output files do not exist:
        if (accOut.filter((x) => !x).length) { return await f.run(filesIn.Matches); }

        const statsIn = await Promise.all(filesIn.Matches.map(async (x) => fileStat(x)));
        const statsOut = await Promise.all(outp.map(async (x) => fileStat(x)));

        const inModified = Math.max(...statsIn.map((x) => x.mtime.getTime()));
        const outModified = Math.max(...statsOut.map((x) => x.mtime.getTime()));
        if (inModified > outModified) { return await f.run(filesIn.Matches); }
        return new ErrorNothingToDo();
    };

    return new Factor(inp, outp, run);
}

async function runCommand(extCmd: string, ...args: string[]): Promise<Error> {
    console.log("==COMMAND:", [extCmd].concat(args).join(" "));
    return await new Promise((resolve) => {
        const proc = spawn(extCmd, args, {stdio: [process.stdin, process.stdout, process.stderr]});
        proc.on("exit", () => resolve(null));
        proc.on("error", (err) => resolve(err));
    });
}

export const func = (
    f: (argv?: string[]) => Promise<Error>,
    input: Domain = null, output: Domain = null): IFactor => new Factor(input, output, f);

export const cmd = (s: string): IFactor => {
    const argv = stringArgv(s);
    const run = async () => {
        if (!argv.length) { return null; }
        let err: Error = null;
        let rpath: string;
        [rpath, err] = await resolveBin(argv[0]);
        if (!err) {
            argv[0] = rpath;
            return await runCommand(process.argv[0], ...argv);
        }
        [err, rpath] = await new Promise((resolve) => {
            which(argv[0], (e, p) => resolve([e, p]));
        });
        if (!err) {
            return await runCommand(rpath, ...argv.slice(1));
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
