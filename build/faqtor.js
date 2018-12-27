"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const glob_1 = __importDefault(require("glob"));
const fs = __importStar(require("fs"));
const util = __importStar(require("util"));
const string_argv_1 = __importDefault(require("string-argv"));
const which_1 = __importDefault(require("which"));
const child_process_1 = require("child_process");
const resolveBin = require("resolve-bin");
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
const normalizeDomain = (d) => {
    let dom = d === null ? [] : typeof d === "string" ? [d] : d;
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
class Factor {
    constructor(Input, Output, run) {
        this.Input = Input;
        this.Output = Output;
        this.run = run;
    }
    run(argv) { return null; }
    factor(input, output) {
        return factor(this, input, output);
    }
}
function factor(f, input, output = null) {
    const inp = normalizeDomain(normalizeDomain(input).concat(normalizeDomain(f.Input)));
    const outp = normalizeDomain(normalizeDomain(output).concat(normalizeDomain(f.Output)));
    const run = async () => {
        if (!inp.length) {
            return await f.run();
        }
        const filesIn = await runGlobs(inp, {});
        if (filesIn.Errs.length) {
            printErrors(filesIn.Errs);
        }
        if (!filesIn.Matches.length) {
            return null;
        }
        if (!outp.length) {
            return await f.run(filesIn.Matches);
        }
        const accOut = await Promise.all(outp.map((x) => new Promise((resolve) => {
            fs.access(x, (err) => resolve(err === null));
        })));
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
        return null;
    };
    return new Factor(inp, outp, run);
}
exports.factor = factor;
async function runCommand(cmd, ...args) {
    console.log("FAQTOR RUNS COMMAND:", [cmd].concat(args).join(" "));
    return await new Promise((resolve) => {
        const proc = child_process_1.execFile(cmd, args);
        proc.stdout.on('data', function (data) {
            console.log(data.toString());
        });
        proc.stderr.on('data', function (data) {
            console.error(data.toString());
        });
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
        [err, rpath] = await new Promise((resolve) => {
            resolveBin(argv[0], (err, rpath) => resolve([err, rpath]));
        });
        if (!err) {
            argv[0] = rpath;
            return await runCommand(process.argv[0], ...argv);
        }
        [err, rpath] = await new Promise((resolve) => {
            which_1.default(argv[0], (err, rpath) => resolve([err, rpath]));
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
        depends = depends.concat(normalizeDomain(f.Input));
        results = results.concat(normalizeDomain(f.Output));
    }
    const run = async () => {
        for (const f of factors) {
            const err = await f.run();
            if (err) {
                return err;
            }
        }
        return null;
    };
    return new Factor(depends, results, run);
};
//# sourceMappingURL=index.js.map