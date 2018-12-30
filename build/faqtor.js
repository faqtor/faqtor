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
    const dom = d === null ? [] : typeof d === "string" ? [d] : d;
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
const isReported = (e) => !!(e.reported);
class ErrorNothingToDo extends Error {
    constructor() {
        super("");
    }
}
class Factor {
    constructor(Input, Output, runf, name = null) {
        this.Input = Input;
        this.Output = Output;
        this.runf = runf;
        this.name = name;
    }
    async run(argv) {
        if (this.name) {
            console.log("\n" + `==<${this.name}>`);
        }
        const err = await this.runf(argv);
        if (this.name) {
            if (err) {
                if (!isReported(err)) {
                    err.reported = true;
                    if (err instanceof ErrorNothingToDo) {
                        console.log(`~~NOTHING TO DO FOR <${this.name}>`);
                    }
                    else {
                        console.log(`~~ERROR IN <${this.name}>:`, err);
                    }
                }
            }
            else {
                console.log(`~~<${this.name}> SUCCESS`);
            }
        }
        return err;
    }
    factor(input, output) {
        return factor(this, input, output);
    }
    named(name) {
        this.name = name;
        return this;
    }
}
function factor(f, input, output = null) {
    const inp = norm(norm(input).concat(norm(f.Input)));
    const outp = norm(norm(output).concat(norm(f.Output)));
    const run = async () => {
        // always run factor if no input globs:
        if (!inp.length) {
            return await f.run();
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
            return await f.run(filesIn.Matches);
        }
        const accOut = await Promise.all(outp.map((x) => pathExists(x)));
        // always run factor if some of output files do not exist:
        if (accOut.filter((x) => !x).length) {
            return await f.run(filesIn.Matches);
        }
        const statsIn = await Promise.all(filesIn.Matches.map(async (x) => fileStat(x)));
        const statsOut = await Promise.all(outp.map(async (x) => fileStat(x)));
        const inModified = Math.max(...statsIn.map((x) => x.mtime.getTime()));
        const outModified = Math.max(...statsOut.map((x) => x.mtime.getTime()));
        if (inModified > outModified) {
            return await f.run(filesIn.Matches);
        }
        return new ErrorNothingToDo();
    };
    return new Factor(inp, outp, run);
}
exports.factor = factor;
async function runCommand(extCmd, ...args) {
    console.log("==COMMAND:", [extCmd].concat(args).join(" "));
    return await new Promise((resolve) => {
        const proc = child_process_1.spawn(extCmd, args, { stdio: [process.stdin, process.stdout, process.stderr] });
        proc.on("exit", () => resolve(null));
        proc.on("error", (err) => resolve(err));
    });
}
exports.cmd = (s) => {
    const argv = string_argv_1.default(s);
    const run = async () => {
        if (!argv.length) {
            return null;
        }
        let err = null;
        let rpath;
        [rpath, err] = await resolveBin(argv[0]);
        if (!err) {
            argv[0] = rpath;
            return await runCommand(process.argv[0], ...argv);
        }
        [err, rpath] = await new Promise((resolve) => {
            which_1.default(argv[0], (e, p) => resolve([e, p]));
        });
        if (!err) {
            return await runCommand(rpath, ...argv.slice(1));
        }
        return err;
    };
    return new Factor(null, null, run);
};
exports.seq = (...factors) => {
    let depends = [];
    let results = [];
    for (const f of factors) {
        depends = depends.concat(norm(f.Input));
        results = results.concat(norm(f.Output));
    }
    const run = async () => {
        for (const f of factors) {
            const err = await f.run();
            if (err && !(err instanceof ErrorNothingToDo)) {
                return err;
            }
        }
        return null;
    };
    return new Factor(depends, results, run);
};
//# sourceMappingURL=index.js.map