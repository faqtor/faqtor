
import * as fs from "fs";
import { promisify } from "util";

const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);

import * as faqtor from "../src/index";

class TempFiles {
    private files: { [key in string] : boolean };
    constructor() {
        this.files = {};
    }

    public async create(name) {
        const x = await writeFile(name, name, {encoding: "utf8"}).catch(e => Error(e));
        if (x instanceof Error) { return x; }
        this.files[name] = true;
    }

    public async close() {
        let e = null;
        for (const name in this.files) {
            const x = await unlink(name).catch((err) => Error(err));
            if (x instanceof Error) { e = x; }
        }
        return e;
    }
}

const wait = (tm) => new Promise((resolve) => setTimeout(resolve, tm));

test("file existance cases", async () => {
    const files = new TempFiles();
    try {
        const f1 = "f1", f2 = "f2", f3 = "f3";
        expect(await files.create(f1)).toBeFalsy();
        await wait(50);
        expect(await files.create(f2)).toBeFalsy();
        let fc = faqtor.func(()=>null).factor(f2, f1);
        expect(await fc.run()).toBeNull();
        fc = faqtor.func(()=>null).factor(f1, f2);
        expect(typeof (await fc.run() as faqtor.ErrorNothingToDo).nothingToDo).toBe("boolean");
        fc = faqtor.func(()=>null).factor(null, f2);
        expect(await fc.run()).toBeNull();
        fc = faqtor.func(()=>null).factor(f3, f2);
        expect(typeof (await fc.run() as faqtor.ErrorNothingToDo).nothingToDo).toBe("boolean");
        fc = faqtor.func(()=>null).factor(f1, f3);
        expect(await fc.run()).toBeNull();
        fc = faqtor.func(()=>null).factor([f1, f3], f2);
        expect(typeof (await fc.run() as faqtor.ErrorNothingToDo).nothingToDo).toBe("boolean");
    } finally {
        expect(await files.close()).toBeFalsy();
    }
});

test("sequential factors", async () => {
    let tab = {};
    const fNull = 
        (name) => (faqtor.func(() => { tab[name] = true; return null}) as faqtor.Factor)
            .named("fNull")
            .task("fNull");
    const fNothingToDo =
        (name) => (faqtor.func(async () => { tab[name] = true; return new faqtor.ErrorNothingToDo()}) as faqtor.Factor)
            .named("fNothingToDo") 
            .task("fNothingToDo");
    const fError =
        (name) => (faqtor.func(async () => { tab[name] = true; return new Error("some error")}) as faqtor.Factor)
            .named("fError")
            .task("fError");

    let e = await faqtor.seq(fNull("1"), fNull("2")).run();
    expect(tab["1"]).toBe(true);
    expect(tab["2"]).toBe(true);
    expect(e).toBeNull();

    tab = {};
    e = await faqtor.seq(fNothingToDo("3"), fNull("4")).run();
    expect(tab["3"]).toBe(true);
    expect(tab["4"]).toBe(true);
    expect(e).toBeNull();

    tab = {};
    e = await faqtor.seq(fError("5"), fNull("6")).run();
    expect(tab["5"]).toBe(true);
    expect(tab["6"]).toBeUndefined();
    expect(e).toBeTruthy();

    e = await faqtor.seq().run();
    expect(e).toBeNull();
});

test("cmd factor", async () => {
    const files = new TempFiles();
    try {
        const f1 = "f1";
        expect(await files.create(f1)).toBeFalsy();
        let err = await faqtor.cmd("rimraf f1").run();
        expect(err).toBeFalsy();
        err = await faqtor.cmd("asjndjksadvnasjkvnaworaowiawdknv").run();
        expect(err).toBeTruthy();
        err = await faqtor.cmd("echo").run();
        expect(err).toBeFalsy();
        err = await faqtor.cmd("").run();
        expect(err).toBeFalsy();
    } finally {
        expect(await files.close()).toBeTruthy();
    }
});

test("set mode", () => {
    faqtor.setMode("dev");
    expect(faqtor.production).toBeFalsy();
    faqtor.setMode("prod");
    expect(faqtor.production).toBeTruthy();
})