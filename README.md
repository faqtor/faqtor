# faqtor
Faqtor build autimation

## Examples

Faqtor build automation system is used in [HyperOOP](https://github.com/HyperOOP/hyperoop) project.
This is a most detailed example of Faqtor/fqr usage. Look at [fqr.config.js](https://github.com/HyperOOP/hyperoop/blob/master/build/fqr.config.js).

## Tutorial

Basically, the Faqtor build system consists of library named `faqtor` and CLI tool named `fqr`

```bash
npm i -D faqtor fqr
```

But for this tutorial it is easier to have `fqr` installed globally:

```bash
npm i -g fqr
```

### Project directory layout

A recommended directory layout for the Faqtor project is following:

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
- `func`
- `seq`

The first one, `cmd`, executes binary:

```javascript
const { cmd } = require("faqtor");

module.exports = {
    all:   cmd("echo 'Hello, All!'"),
    world: cmd("echo 'Hello, World!'"),
}
```

In this case commands `fqr all` and `fqr world` will produce more complex outputs:

```bash
fqr all

==<all>
--COMMAND: /bin/echo 'Hello, All!'
Hello, All!
~~<all> SUCCESS
```
