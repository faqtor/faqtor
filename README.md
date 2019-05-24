<p align="center">
<a href="https://travis-ci.org/faqtor/faqtor"><img src="https://travis-ci.org/faqtor/faqtor.svg?branch=master" alt="Build Status"></a>
<a href="https://codecov.io/gh/faqtor/faqtor"><img src="https://codecov.io/gh/faqtor/faqtor/branch/master/graph/badge.svg" alt="codecov"/></a>
<a href="https://www.npmjs.com/package/faqtor"><img src="https://img.shields.io/npm/v/faqtor.svg" alt="npm"/></a>
<a href="https://github.com/faqtor/faqtor"><img src="https://img.shields.io/github/languages/top/faqtor/faqtor.svg" alt="GitHub top language"/></a>
<a href="https://www.npmjs.com/package/faqtor"><img src="https://img.shields.io/npm/dt/faqtor.svg" alt="npm"/></a>
<a href="https://snyk.io/test/npm/faqtor"><img src="https://snyk.io/test/npm/faqtor/badge.svg" alt="Known Vulnerabilities"/></a>
<a href="https://gitter.im/faqtor/questions?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge"><img src="https://badges.gitter.im/faqtor/questions.svg" alt="Join the chat at https://gitter.im/hyper-oop"/></a>
</p>

# faqtor
Promise-based build automation for the NodeJS ecosystem 

## Table of contents
 * [Tutorial](#tutorial)
   * [Project directory layout](#project-directory-layout)
   * [Faqtor configuration basics](#faqtor-configuration-basics)
   * [Real world examples](#real-world-examples)
 * [Example](#example)


## Tutorial

Basically, the Faqtor build system consists of library named `faqtor` and CLI tool named `fqr`

```bash
npm i -D faqtor fqr
```

But for this tutorial it is easier to have `fqr` installed globally:

```bash
npm i -g fqr
```

Also you may install additional Faqtor plugins in order to use tools like [rollup](https://rollupjs.org) or [browser-sync](https://browsersync.io/). They are called with prefix 'faqtor-of-' usually, like [faqtor-of rollup](https://www.npmjs.com/package/faqtor-of-rollup) or [faqtor-of-browser-sync](https://www.npmjs.com/package/faqtor-of-browser-sync). Just [search for the faqtor](https://www.npmjs.com/search?q=faqtor).

### Project directory layout

The recommended directory layout for a Faqtor-based project is following:

    .
    ├──build               # Folder containing all files related to the project building
    │  ├──fqr.config.js    # Faqtor configuration file containing all information about how to build
    │  ├──...
    ├──package.json        # The usual package description file
    ├──...                 # Other project files

In this case `fqr` will find `fqr.config.js` in the `build` directory automatically, with no additional configuration. But if you don't plan to have the `build` folder in your project, then the following structure will also work:

    .
    ├──fqr.config.js
    ├──package.json
    ├──...

### Faqtor configuration basics

File `fqr.config.js` is just JavaScript nodejs module. For example, this file is valid `fqr.config.js`:

```javascript
module.exports = {
    hello: () => console.log("Hello, World!"),
}
```

Then if you type following bash command (with `fqr` installed globally):

```bash
fqr hello
```

you will see the expected output `Hello, World!`. But usually entries of `module.exports` are more complex objects, called factors. The faqtor library itself provides following functions for producing factors:

- `cmd`
- `seq`
- `all`
- `func`

#### Factor of `cmd`

The first one, `cmd`, executes binary:

```javascript
const { cmd } = require("faqtor");

module.exports = {
    friends: cmd("echo 'Hello, friends!'"),
    world:   cmd("echo 'Hello, World!'"),
}
```

In this case commands `fqr friends` and `fqr world` will produce more complex outputs, for example:

```
fqr friends

==<friends>
--COMMAND: /bin/echo 'Hello, friends!'
Hello, friends!
~~<friends> SUCCESS
```

Anouther feature of the `cmd` is that it can look for binaries in the local `node_modules`. For example if you have [rimraf](https://www.npmjs.com/package/rimraf) locally installed in your project then you can execute it:

```javascript
const { cmd } = require("faqtor");

module.exports = {
    clean: cmd("rimraf *.o"),
}
```

Let's try it, assuming there are some `.o` files:

```
fqr clean

==<clean>
--COMMAND: /usr/bin/node /..../src/faqtor/tutorial/node_modules/.bin/rimraf *.o
~~<clean> SUCCESS
```

As you can see, `cmd` has properly found locally installed `rimraf` and executed it.

#### Factor of `seq`

Factor produced by `seq` can execute several factors one by one. It stops execution if some factor returns error. In other words, `seq` acts much like `&&` operator of bash:

```javascript
const { cmd, seq } = require("faqtor");

const
    clean = cmd("rimraf *.o"),
    hello = cmd("echo 'Hello, World!'");  

module.exports = {
    sequence: seq(hello, clean),
}
```

Try this configuration:

```
fqr sequence

==<sequence>
--COMMAND: /bin/echo 'Hello, World!'
Hello, World!
--COMMAND: /usr/bin/node /..../src/faqtor/tutorial/node_modules/.bin/rimraf *.o
~~<sequence> SUCCESS
```

#### Factor of `all`

Factor produced by `all` can execute several factors in "parallel" using `Promise.all`. See [example](#example) above.

#### Factor of `func`

Finally, `func` can produce factor from user defined function, that may have about the following signature:

```typescript
function MyFactor(argv?: string[]): Promise<Error>
```

Let's create the following configuration:

```javascript
const { func } = require("faqtor");

const myHello = (someone) => console.log(`Привет, ${someone}!`)

module.exports = {
    hello: func(myHello),
}
```

Now try:

```
fqr "hello World"

==<hello>
Привет, World!
~~<hello> SUCCESS
```

The difference between providing factor object and just function as entry is that factor have some convenient methods like `task`.

#### Method `task`

Let's modify the previous example:

```javascript
const { func } = require("faqtor");

const myHello = (someone) => console.log(`Привет, ${someone}!`)

module.exports = {
    hello: func(myHello).task("greet someone"),
}
```

As you see we added call of the `task` method with argument `"greet someone"`. Now we can see task description in the output:

```
fqr "hello World"

==<hello>
--TASK:    greet someone
Привет, World!
~~<hello> SUCCESS
```

It is especially convenient when you run many tasks during build process, and some of them may run silently.

#### Method `factor`

Another important feature of factor object is the method of the same name, `factor`. It has the following signature:

```typescript
public factor(input?: Domain, output?: Domain): IFactor
```

where `Domain` is TypeScript type:

```typescript
export type Domain = null | string | string[];
```

`Domain` argument may contain some [glob](https://www.npmjs.com/package/glob) or array of globs. In this case Faqtor system calculates the maximum of modification times of files matching the glob. Now the given factor will be executed in the case if the time calculated for input is greater then for output. More precisely, Faqtor system checks the following conditions consequently:

- run factor if no input globs
- return "nothing to do" if input has globs but no files
- run factor if no output globs
- run factor if has output globs but no files
- run factor if modification time for input is greater then modification time for output
- return "nothing to do" otherwise

Calling `factor` method with no arguments is meaningful for some factors that have their "native" input or output globs. Example of such factor is one produced by [faqtor-of-uglify](https://www.npmjs.com/package/faqtor-of-uglify):

```javascript
const uglify = minify("index.js", "index.min.js")
    .factor()
    .task("minifying 'index.js'");
```

Here `"index.js"` and `"index.min.js"` are used by default as input and output `Domain`'s correspondently.

... _to be continued_ ...

### Real world examples

Faqtor build automation system is used in [HyperOOP](https://github.com/HyperOOP) project.
The most detailed example of Faqtor/fqr and plugins usage is [source code](https://github.com/HyperOOP/hyperoop-site) of the HyperOOP homepage. Look at [fqr.config.js](https://github.com/HyperOOP/hyperoop-site/blob/master/build/fqr.config.js). Other examples of Faqtor configuration files are [HyperOOP library](https://github.com/HyperOOP/hyperoop/blob/master/build/fqr.config.js) and [HyperOOP Router library](https://github.com/HyperOOP/hyperoop-router/blob/master/build/fqr.config.js) build configuration files. Also all our official plugins have Faqtor configuration files, but they are similar, look at [this one](https://github.com/faqtor/faqtor-of-watch/blob/master/build/fqr.config.js) for example.


## Example

You can install and run this example locally:

```
git clone https://github.com/faqtor/example faqtor-example
cd faqtor-example
npm i
npm start
```

Then try to change `src/template.html` and `src/index.js`: all changes will be visible in browser immediately.

Let's look at build configuration (`build/fqr.config.js`):

```javascript
// Necessary utilities from 'faqtor' library:
const { seq, cmd, all } = require("faqtor")

// Factor produced by 'minify' will perform javascript minification:
const { minify } = require("faqtor-of-uglify");

// Factor produced by 'render' will run our HTML template:
const { render } = require("faqtor-of-handlebars");

// Factor to watch changes in files:
const { watch } = require("faqtor-of-watch");

// 'bs' can produce factors for usual browser-sync tasks, like 'reload' for example:
const bs = require("faqtor-of-browser-sync").create();

// In this block we create elementary parts of our building process:
const
    // create 'dist' and 'dist/js' folders if they don't exist, using 'mkdirp' command:
    makeDistFolder = cmd("mkdirp dist/js"),
    // create development version of 'index.html' using handlebars:
    devMakeIndexHtml = render("src/template.html", "src/index.html", {
            indexJS: "./index.js"
        }),
    // create production version of 'index.html' using handlebars:
    prodMakeIndexHtml = render("src/template.html", "dist/index.html", {
            indexJS: "js/index.js"
        }),
    // minify 'index.js' for production
    uglifyIndexJS = minify("src/index.js", "dist/js/index.js"),
    // reload browsers if something on page has changed
    reloadBrowserPage = bs.reload("src/index.*");

module.exports = {
    // entry 'build' to call from 'package.json/scripts': fqr build
    // 'seq' is sequence of tasks, analog of bash && operator
    build: seq(makeDistFolder, uglifyIndexJS, prodMakeIndexHtml),
    // entry 'serve' to call from 'package.json/scripts': fqr serve
    // watch for changes and reload page if necessary
    serve: seq(devMakeIndexHtml, all(
        bs.init({ server: { baseDir: "src" } }),
        watch([devMakeIndexHtml, reloadBrowserPage])
    )),
    // entry 'clean' to call from 'package.json/scripts': fqr clean
    clean: cmd("rimraf dist src/index.html")
}

```

