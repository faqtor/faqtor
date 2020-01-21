"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const glob_1 = __importDefault(require("glob"));
const path = __importStar(require("path"));
const string_argv_1 = __importDefault(require("string-argv"));
const util = __importStar(require("util"));
const which_1 = __importDefault(require("which"));
const chalk_ = __importStar(require("chalk"));
const chalk = chalk_.default;
class ErrorPathDoesNotExists extends Error {
    constructor(p) {
        super(`Path ${p} does not exist`);
    }
}
const pathExists = (p) => new Promise((resolve) => {
    fs.access(p, (err) => resolve(err === null));
});
const runExternal = (extCmd) => new Promise((resolve) => {
    child_process_1.exec(extCmd, (err, stdout) => {
        resolve([stdout.trim(), err]);
    });
});
const resolveBin = async (name) => {
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
const runGlob = async (pattern, options) => new Promise((resolve) => {
    glob_1.default(pattern, options, (err, matches) => resolve({ Errs: err ? [err] : null, Matches: matches }));
});
const runGlobs = async (globs, options) => {
    const r = await Promise.all(globs.map((g) => runGlob(g, options)));
    return {
        Errs: [].concat(r.filter((x) => !!x.Errs)),
        Matches: [].concat(...r.map((x) => x.Matches)),
    };
};
const norm = (d) => {
    const dom = !d ? [] : typeof d === "string" ? [d] : d;
    if (dom.length < 2) {
        return dom;
    }
    const tab = {};
    for (const s of dom) {
        tab[s] = true;
    }
    return Object.getOwnPropertyNames(tab);
};
const fileStat = util.promisify(fs.stat);
function printErrors(errs) {
    for (const err of errs) {
        console.error(err);
    }
}
exports.isReported = (e) => !!(e.reported);
class ErrorNothingToDo extends Error {
    constructor(nothingToDo = true, reported = true) {
        super("");
        this.nothingToDo = nothingToDo;
        this.reported = reported;
    }
}
exports.ErrorNothingToDo = ErrorNothingToDo;
exports.isNothingToDo = (e) => !!(e.nothingToDo);
const trgPrefix = chalk.blue.bold("TARGET:   ");
const cmdPrefix = chalk.gray.bold("COMMAND:  ");
const tskPrefix = chalk.green.bold("TASK:     ");
const sccPrefix = chalk.blue.bold("SUCCEED:  ");
const errPrefix = chalk.redBright.bold("ERROR IN: ");
const notPrefix = chalk.blue.bold("NO TASKS: ");
class Factor {
    constructor(Input, Output, runf) {
        this.Input = Input;
        this.Output = Output;
        this.runf = runf;
        this.name = null;
        this.taskInfo = null;
        this.mustRun = false;
    }
    async run(argv) {
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
                }
                else if (!exports.isReported(err)) {
                    err.reported = true;
                    console.log(`${errPrefix}${this.name}, ${err}`);
                }
            }
            else {
                console.log(sccPrefix + this.name);
            }
        }
        return err;
    }
    factor(input, output) {
        return factor(this, input, output);
    }
    get MustRun() {
        return this.mustRun;
    }
    must() {
        this.mustRun = true;
        return this;
    }
    named(name) {
        this.name = name;
        return this;
    }
    task(info) {
        this.taskInfo = info;
        return this;
    }
}
exports.Factor = Factor;
function factor(f, input, output = null) {
    const inp = norm(norm(input).concat(norm(f.Input)));
    const outp = norm(norm(output).concat(norm(f.Output)));
    const run = async (argv) => {
        // always run factor if no input globs:
        if (!inp.length) {
            return await f.run(argv);
        }
        const filesIn = await runGlobs(inp, {});
        if (filesIn.Errs.length) {
            printErrors(filesIn.Errs);
        }
        // nothing to do if has globs but no files:
        if (!filesIn.Matches.length) {
            return new ErrorNothingToDo();
        }
        // always run factor if no output files:
        if (!outp.length) {
            return await f.run(argv);
        }
        const filesOut = await runGlobs(outp, {});
        if (filesOut.Errs.length) {
            printErrors(filesOut.Errs);
        }
        // always run factor if has output globs but no files:
        if (!filesOut.Matches.length) {
            return await f.run(argv);
        }
        const statsIn = await Promise.all(filesIn.Matches.map(async (x) => fileStat(x)));
        const statsOut = await Promise.all(filesOut.Matches.map(async (x) => fileStat(x)));
        const inModified = Math.max(...statsIn.map((x) => x.mtime.getTime()));
        const outModified = Math.max(...statsOut.map((x) => x.mtime.getTime()));
        if (inModified > outModified) {
            return await f.run(argv);
        }
        return new ErrorNothingToDo();
    };
    return new Factor(inp, outp, run);
}
exports.factor = factor;
class ErrorNonZeroExitCode extends Error {
    constructor(cmdName, code) {
        super(`Process ${cmdName} exited with code ${code}`);
    }
}
async function runCommand(extCmd, ...args) {
    return await new Promise((resolve) => {
        let proc = null;
        if (!/^win/.test(process.platform)) { // linux
            proc = child_process_1.spawn(extCmd, args, { stdio: [process.stdin, process.stdout, process.stderr] });
        }
        else { // windows
            proc = child_process_1.spawn('cmd', ['/s', '/c', extCmd, ...args], { stdio: [process.stdin, process.stdout, process.stderr] });
        }
        proc.on("exit", (code) => resolve(code ? new ErrorNonZeroExitCode(extCmd, code) : null));
        proc.on("error", (err) => resolve(err));
    });
}
exports.func = (f, input = null, output = null) => new Factor(input, output, f);
exports.cmd = (s) => {
    s = s.trim();
    const argv = string_argv_1.default(s);
    const run = async (args) => {
        args = args ? argv.concat(args) : argv;
        if (!args.length) {
            return null;
        }
        let err = null;
        let rpath;
        [rpath, err] = await resolveBin(args[0]);
        if (!err) {
            const extCmd = rpath;
            const intCmd = args[0];
            const txt = (extCmd + " " + s.replace(intCmd, "")).trim();
            console.log(cmdPrefix + txt);
            return await runCommand(rpath, ...args.slice(1));
        }
        [err, rpath] = await new Promise((resolve) => {
            which_1.default(args[0], (e, p) => resolve([e, p]));
        });
        if (!err) {
            const extCmd = rpath;
            const intCmd = args[0];
            const txt = (extCmd + " " + s.replace(intCmd, "")).trim();
            console.log(cmdPrefix + txt);
            return await runCommand(rpath, ...args.slice(1));
        }
        return err;
    };
    return new Factor(null, null, run);
};
exports.seq = (...factors) => {
    let depends = [];
    let results = [];
    for (const f of factors) {
        depends = norm(depends.concat(norm(f.Input)));
        results = norm(results.concat(norm(f.Output)));
    }
    const run = async (argv) => {
        let err = null;
        let i = 0;
        for (; i < factors.length; i++) {
            const f = factors[i];
            if (err && !exports.isNothingToDo(err)) {
                if (f.MustRun)
                    await f.run();
            }
            else {
                err = await f.run();
            }
        }
        return err;
    };
    return new Factor(depends, results, run);
};
exports.cmds = (...c) => exports.seq(...c.map((s) => exports.cmd(s)));
const errorsToString = (errors) => {
    let msg = "Errors occured:\n";
    for (const e of errors) {
        msg += `\t${e}\n`;
    }
    return msg;
};
class CompoundError extends Error {
    constructor(errors) {
        super(errorsToString(errors));
    }
}
exports.all = (...tsk) => {
    const run = async (argv) => {
        let result = await Promise.all(tsk.map((t) => t.run(argv)));
        result = result.filter((e) => e && !exports.isReported(e));
        if (result.length)
            return new CompoundError(result);
        return null;
    };
    return exports.func(run);
};
exports.production = true;
exports.mode = "production";
exports.setMode = (name) => {
    if (name) {
        exports.mode = name;
        const prodSyn = { prod: 1, production: 1 };
        exports.production = exports.mode in prodSyn;
    }
};
exports.setMode(global.FAQTOR_MODE);
//# sourceMappingURL=index.js.map