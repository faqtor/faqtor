const { factor, cmd, seq } = require("faqtor");

const dist = "./dist";
const modules = "./node_modules";
const input = "src/**/*";
const esOutput = `${dist}/index.es.js`;
const cjsOutput = `${dist}/index.js`;

const tsc = (inp, outp, project) => factor(cmd(`tsc -p ${project}`), inp, outp);
const rename = (a, b) => factor(cmd(`mv ${a} ${b}`), a, b);
const clean = factor(cmd(`rimraf ${dist}`), dist);
const cleanAll = factor(cmd(`rimraf ${dist} ${modules}`), [dist, modules]);

const buildEs = seq(tsc(input, esOutput, "build/tsconfig.es.json"), rename(cjsOutput, esOutput));
const buildCjs = tsc(input, cjsOutput, "build/tsconfig.cjs.json")

module.exports = {
    clean,
    cleanAll,
    buildEs,
    buildCjs,
    build: seq(buildEs, buildCjs)
}