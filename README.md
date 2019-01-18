# faqtor
Promise-based build automation for the NodeJS ecosystem 

## Tutorial

Basically, the Faqtor build system consists of library named `faqtor` and CLI tool named `fqr`

```bash
npm i -D faqtor fqr
```

But for this tutorial it is easier to have `fqr` installed globally:

```bash
npm i -g fqr
```

Also you may install additional Faqtor plugins in order to use tools like [rollup](https://rollupjs.org) or [browser-sync](https://browsersync.io/). They are called with prefix 'faqtor-of-' usually, like [faqtor-of rollup](https://www.npmjs.com/package/faqtor-of-rollup) or [faqtor-of-browser-sync](https://www.npmjs.com/package/faqtor-of-browser-sync).

### Project directory layout

The recommended directory layout for the Faqtor project is following:

    .
    ├──build               # Folder containing all files related to the project building
    |  ├──fqr.config.js    # Faqtor configuration file containing all information about how to build
    |  ├──...
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
- `func`

#### Factor of `cmd`

The first one, `cmd`, executes binary:

```javascript
const { cmd } = require("faqtor");

module.exports = {
    all:   cmd("echo 'Hello, All!'"),
    world: cmd("echo 'Hello, World!'"),
}
```

In this case commands `fqr all` and `fqr world` will produce more complex outputs, for example:

```
fqr all

==<all>
--COMMAND: /bin/echo 'Hello, All!'
Hello, All!
~~<all> SUCCESS
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

#### Factor of `func`

Finally, `func` can produce factor from user defined function, that may have about the following signature:

```typescript
function MyFactor(argv?: string[]): Promise<Error>
```

... _to be continued_ ...

### Real world examples

Faqtor build automation system is used in [HyperOOP](https://github.com/HyperOOP/hyperoop) project.
The most detailed example of Faqtor/fqr and plugins usage is [source code](https://github.com/HyperOOP/hyperoop-site) of the HyperOOP homepage. Look at [fqr.config.js](https://github.com/HyperOOP/hyperoop-site/blob/master/build/fqr.config.js). Other examples of Faqtor configuration files are [HyperOOP library](https://github.com/HyperOOP/hyperoop/blob/master/build/fqr.config.js) and [HyperOOP Router library](https://github.com/HyperOOP/hyperoop-router/blob/master/build/fqr.config.js) build configuration files. Also all our official plugins have Faqtor configuration files, but they are similar, look at [this one](https://github.com/faqtor/faqtor-of-watch/blob/master/build/fqr.config.js) for example.

