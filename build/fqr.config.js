const { cmd, seq } = require("./faqtor");

const dist = "./dist";
const modules = "./node_modules";
const input = "src/**/*";
const esOutput = `${dist}/index.es.js`;
const cjsOutput = `${dist}/index.js`;

const tsc = (project) => cmd(`tsc -p ${project}`);
const rename = (a, b) => cmd(`mv ${a} ${b}`);

const clean = cmd(`rimraf ${dist}`)
    .factor(dist);

const cleanAll = cmd(`rimraf ${dist} ${modules}`)
    .factor([dist, modules]);

const buildEs = seq(
    tsc("build/tsconfig.es.json"),
    rename(cjsOutput, esOutput))
        .factor(input, esOutput);

const buildCjs = tsc("build/tsconfig.cjs.json")
    .factor(input, cjsOutput);

module.exports = {
    clean,
    cleanAll,
    buildEs,
    buildCjs,
    build: seq(buildEs, buildCjs),
    echo: cmd("echo OK")
}