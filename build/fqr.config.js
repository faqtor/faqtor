const { cmd, seq } = require("./faqtor");

const dist = "./dist";
const modules = "./node_modules";
const input = "src/**/*";
const esOutput = `${dist}/index.es.js`;
const cjsOutput = `${dist}/index.js`;

const tsc = (inp, outp, project) =>
    cmd(`tsc -p ${project}`)
        .factor(inp, outp);

const rename = (a, b) => 
    cmd(`mv ${a} ${b}`)
        .factor(a, b);

const clean = cmd(`rimraf ${dist}`)
    .factor(dist);

const cleanAll = cmd(`rimraf ${dist} ${modules}`)
    .factor([dist, modules]);

const buildEs = seq(
    tsc(input, esOutput, "build/tsconfig.es.json"),
    rename(cjsOutput, esOutput));

const buildCjs = tsc(input, cjsOutput, "build/tsconfig.cjs.json")

module.exports = {
    clean,
    cleanAll,
    buildEs,
    buildCjs,
    build: seq(buildEs, buildCjs),
    echo: cmd("echo OK")
}