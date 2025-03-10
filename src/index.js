import path from 'path'
import * as commonTags from 'common-tags'

let defaultColors = [
  'bgBlue.bold',
  'bgMagenta.bold',
  'bgGreen.bold',
  'bgBlack.bold',
  'bgCyan.bold',
  'bgRed.bold',
  'bgWhite.bold',
  'bgYellow.bold',
  // TODO: add more colors that look good?
]

export {
  concurrent,
  series,
  runInNewWindow,
  rimraf,
  ifWindows,
  ifNotWindows,
  ifCI,
  ifNotCI,
  copy,
  ncp,
  mkdirp,
  open,
  crossEnv,
  commonTags,
  setColors,
  includePackage,
  shellEscape,
  getBin,
}

/**
 * Set your own colours used by nps scripts
 * @param {string[]} colors - Array of color strings supported by concurrent
 * @example
 * setColors(['white.bgblue.bold', 'black.bgYellow.dim', 'white.bgGreen'])
 */
function setColors(colors) {
  defaultColors = colors
}
/**
 * Accepts any number of scripts, filters out any
 * falsy ones and joins them with ' && '
 * @param {...string} scripts - Any number of strings representing commands
 * @example
 * // returns 'eslint && jest && webpack --env.production'
 * series('eslint', 'jest', 'webpack --env.production')
 * @return {string} - the command that will execute the given scripts in series
 */
function series(...scripts) {
  return scripts.filter(Boolean).join(' && ')
}

/**
 * Accepts any number of nps script names, filters out
 * any falsy ones, prepends `nps` to them, and passes
 * the that to `series`
 * @param {...string} scriptNames - the script names to run
 * // returns 'nps lint && nps "test --coverage" && nps build'
 * series.nps('lint', 'test --coverage', 'build')
 * @return {string} - the command that will execute the nps scripts in series
 */
series.nps = function seriesNPS(...scriptNames) {
  return series(
    ...scriptNames
      .filter(Boolean)
      .map(scriptName => scriptName.trim())
      .filter(Boolean)
      .map(scriptName => `nps ${quoteScript(scriptName)}`),
  )
}

/**
 * A concurrent script object
 * @typedef {Object|string} ConcurrentScript
 * @property {string} script - the command to run
 * @property {string} color - the color to use
 *   (see concurrently's docs for valid values)
 */
/**
 * An object of concurrent script objects
 * @typedef {Object.<ConcurrentScript>} ConcurrentScripts
 */

/**
 * Generates a command that uses `concurrently` to run
 * scripts concurrently. Adds a few flags to make it
 * behave as you probably want (like --kill-others-on-fail).
 * In addition, it adds color and labels where the color
 * can be specified or is defaulted and the label is based
 * on the key for the script.
 * @param {ConcurrentScripts} scripts - the scripts to run
 *   note: this function filters out falsy values :)
 * @example
 * // returns a bit of a long script that can vary slightly
 * // based on your environment... :)
 * concurrent({
 *   lint: {
 *     script: 'eslint .',
 *     color: 'bgGreen.white.dim',
 *   },
 *   test: 'jest',
 *   build: {
 *     script: 'webpack'
 *   }
 * })
 * @return {string} - the command to run
 */
function concurrent(scripts) {
  const {colors, scripts: quotedScripts, names} = Object.keys(scripts)
    .reduce(reduceScripts, {
      colors: [],
      scripts: [],
      names: [],
    })
  const flags = [
    '--kill-others-on-fail',
    `--prefix-colors "${colors.join(',')}"`,
    '--prefix "[{name}]"',
    `--names "${names.join(',')}"`,
    shellEscape(quotedScripts),
  ]
  const concurrently = runBin('concurrently')
  return `${concurrently} ${flags.join(' ')}`

  function reduceScripts(accumulator, scriptName, index) {
    let scriptObj = scripts[scriptName]
    if (!scriptObj) {
      return accumulator
    } else if (typeof scriptObj === 'string') {
      scriptObj = {script: scriptObj}
    }
    const {
      script,
      color = defaultColors[index % defaultColors.length],
    } = scriptObj
    if (!script) {
      return accumulator
    }
    accumulator.names.push(scriptName)
    accumulator.colors.push(color)
    accumulator.scripts.push(script)
    return accumulator
  }
}

/**
 * Accepts any number of nps script names, filters out
 * any falsy ones, prepends `nps` to them, and passes
 * the that to `concurrent`
 * @param {...string} scriptNames - the script names to run
 * @example
 * // will basically return `nps lint & nps "test --coverage" & nps build`
 * // but with the concurrently command and relevant flags to make
 * // it super awesome with colors and whatnot. :)
 * concurrent.nps('lint', 'test --coverage', 'build')
 * @return {string} the command to run
 */
concurrent.nps = function concurrentNPS(...scriptNames) {
  return concurrent(
    scriptNames.map(mapNPSScripts).reduce(reduceNPSScripts, {}),
  )

  function mapNPSScripts(scriptName, index) {
    const color = defaultColors[index]
    if (!Boolean(scriptName)) {
      return undefined
    } else if (typeof scriptName === 'string') {
      return {script: scriptName, color}
    } else {
      return Object.assign({color}, scriptName)
    }
  }

  function reduceNPSScripts(scripts, scriptObj) {
    if (!scriptObj) {
      return scripts
    }
    const {color, script} = scriptObj
    const [name] = script.split(' ')
    scripts[name] = {
      script: `nps ${quoteScript(script.trim())}`,
      color,
    }
    return scripts
  }
}

/**
 * EXPERIMENTAL: THIS DOES NOT CURRENTLY WORK FOR ALL TERMINALS
 * Takes a command and returns a version that should run in
 * another tab/window of your terminal. Currently only supports
 * Windows cmd (new window) and Terminal.app (new tab)
 * @param {string} command - the command to run in a new tab/window
 * @example
 * // returns some voodoo magic to make the terminal do what you want
 * runInNewWindow('echo hello')
 * @return {string} - the command to run
 */
function runInNewWindow(command) {
  return isWindows() ?
    `start cmd /k "cd ${process.cwd()} && ${command}"` :
    commonTags.oneLine`
      osascript
      -e 'tell application "Terminal"'
      -e 'tell application "System Events"
      to keystroke "t" using {command down}'
      -e 'do script "cd ${process.cwd()} && ${command}" in front window'
      -e 'end tell'
    `
}

/**
 * EXPERIMENTAL: THIS DOES NOT CURRENTLY WORK FOR ALL TERMINALS
 * Takes an nps script name and prepends it with a call to nps
 * then forwards that to `runInNewWindow` properly escaped.
 * @param {string} scriptName - the name of the nps script to run
 * @example
 * // returns a script that runs
 * // `node node_modules/.bin/nps "lint --cache"`
 * // in a new tab/window
 * runInNewWindow.nps('lint --cache')
 * @return {string} - the command to run
 */
runInNewWindow.nps = function runInNewWindowNPS(scriptName) {
  const escaped = true
  return runInNewWindow(
    `node node_modules/.bin/nps ${quoteScript(scriptName, escaped)}`,
  )
}

/**
 * Gets a script that uses the rimraf binary. rimraf
 * is a dependency of nps-utils, so you don't need to
 * install it yourself.
 * @param {string} args - args to pass to rimraf
 *   learn more from http://npm.im/rimraf
 * @return {string} - the command with the rimraf binary
 */
function rimraf(args) {
  return `${runBin('rimraf')} ${args}`
}

/**
 * Takes two scripts and returns the first if the
 * current environment is windows, and the second
 * if the current environment is not windows
 * @param {string} script - the script to use for windows
 * @param {string} altScript - the script to use for non-windows
 * @return {string} - the command to run
 */
function ifWindows(script, altScript) {
  return isWindows() ? script : altScript
}

/**
 * Simply calls ifWindows(altScript, script)
 * @param {string} script - the script to use for non-windows
 * @param {string} altScript - the script to use for windows
 * @return {string} - the command to run
 */
function ifNotWindows(script, altScript) {
  return ifWindows(altScript, script)
}

/**
 * Takes two scripts and returns the first if the
 * current environment is CI, and the second
 * if the current environment is not CI
 * @param {string} script - the script to use for CI
 * @param {string} altScript - the script to use for non-CI
 * @return {string} - the command to run
 */
function ifCI(script, altScript) {
  return isCI() ? script : altScript
}

/**
 * Simply calls ifCI(altScript, script)
 * @param {string} script - the script to use for non-CI
 * @param {string} altScript - the script to use for CI
 * @return {string} - the command to run
 */
function ifNotCI(script, altScript) {
  return ifCI(altScript, script)
}

/**
 * Gets a script that uses the cpy-cli binary. cpy-cli
 * is a dependency of nps-utils, so you don't need to
 * install it yourself.
 * @param {string} args - args to pass to cpy-cli
 *   learn more from http://npm.im/cpy-cli
 * @return {string} - the command with the cpy-cli binary
 */
function copy(args) {
  return `${runBin('cpy-cli', 'cpy')} ${args}`
}

/**
 * Gets a script that uses the ncp binary. ncp
 * is a dependency of nps-utils, so you don't need to
 * install it yourself.
 * @param {string} args - args to pass to ncp
 *   learn more from http://npm.im/ncp
 * @return {string} - the command with the ncp binary
 */
function ncp(args) {
  return `${runBin('ncp')} ${args}`
}

/**
 * Gets a script that uses the mkdirp binary. mkdirp
 * is a dependency of nps-utils, so you don't need to
 * install it yourself.
 * @param {string} args - args to pass to mkdirp
 *   learn more from http://npm.im/mkdirp
 * @return {string} - the command with the mkdirp binary
 */
function mkdirp(args) {
  return `${runBin('mkdirp')} ${args}`
}

/**
 * Gets a script that uses the opn-cli binary. opn-cli
 * is a dependency of nps-utils, so you don't need to
 * install it yourself.
 * @param {string} args - args to pass to opn-cli
 *   learn more from http://npm.im/opn-cli
 * @return {string} - the command with the opn-cli binary
 */
function open(args) {
  return `${runBin('opn-cli', 'opn')} ${args}`
}

/**
 * Gets a script that uses the cross-env binary. cross-env
 * is a dependency of nps-utils, so you don't need to
 * install it yourself.
 * @param {string} args - args to pass to cross-env
 *   learn more from http://npm.im/cross-env
 * @return {string} - the command with the cross-env binary
 */
function crossEnv(args) {
  return `${runBin('cross-env')} ${args}`
}

/**
 * The options to pass to includePackage
 * @typedef {Object|string} IncludePackageOptions
 * @property {string} path - the path to the package scripts
 */

/**
 * Includes the scripts from a sub-package in your repo (for
 * yarn workspaces or lerna style projects).
 * @param {IncludePackageOptions} packageNameOrOptions - either a
 * simple name for the sub-package or an options object where you can
 * specify the exact path to the package to include.
 *  If you just provide the name and not the options object, then the path
 *  defaults to: ./packages/{package}/package-scripts.js
 * @return {any} will return an object of scripts loaded from that package
 */
function includePackage(packageNameOrOptions) {
  const packageScriptsPath = typeof packageNameOrOptions === 'string' ?
    `./packages/${packageNameOrOptions}/package-scripts.js` :
    packageNameOrOptions.path

  const startingDir = process.cwd().split('\\').join('/')

  const relativeDir = path
    .relative(startingDir, path.dirname(packageScriptsPath))
    .split('\\')
    .join('/')

  const relativeReturn = path
    .relative(relativeDir, startingDir)
    .split('\\')
    .join('/')

  const scripts = require(packageScriptsPath)

  // eslint-disable-next-line
  function replace(obj, prefix) {
    const retObj = {}
    const dot = prefix ? '.' : ''
    for (const key in obj) {
      if (key === 'description') {
        retObj[key] = obj[key]
      } else if (key === 'script') {
        retObj[key] = series(
          `cd ${relativeDir}`,
          `npm start ${prefix}`,
          `cd "${relativeReturn}"`,
        )
      } else if (typeof obj[key] === 'string') {
        retObj[key] = series(
          `cd ${relativeDir}`,
          `npm start ${prefix}${dot}${key}`,
        )
      } else {
        retObj[key] = Object.assign(
          {},
          replace(obj[key], `${prefix}${dot}${key}`, `cd "${startingDir}"`),
        )
      }
    }
    return retObj
  }

  return replace(scripts.scripts, '')
}

// utils

function quoteScript(script, escaped) {
  const quote = escaped ? '\\"' : '"'
  const shouldQuote = script.indexOf(' ') !== -1
  return shouldQuote ? `${quote}${script}${quote}` : script
}

/**
 * Get the path to one of the bin scripts exported by a package
 * @param {string} packageName - name of the npm package
 * @param {string} binName=packageName - name of the script
 * @returns {string} path, relative to process.cwd()
 */
function getBin(packageName, binName = packageName) {
  const packagePath = require.resolve(`${packageName}/package.json`)
  const concurrentlyDir = path.dirname(packagePath)
  let {bin: binRelativeToPackage} = require(packagePath)
  if (typeof binRelativeToPackage === 'object') {
    binRelativeToPackage = binRelativeToPackage[binName]
  }
  const fullBinPath = path.join(concurrentlyDir, binRelativeToPackage)
  return path.relative(process.cwd(), fullBinPath)
}

function runBin(...args) {
  return `node ${getBin(...args)}`
}

function isWindows() {
  // lazily require for perf :)
  return require('is-windows')()
}

function isCI() {
  // lazily require for perf :)
  return require('ci-info').isCI
}

/**
 * Escape a string so the shell expands it to the original.
 * @param {string|array} arg - as accepted by any-shell-escape; arrays will
 * yield multiple arguments in the shell
 * @returns {string} ready to pass to shell
 */
function shellEscape(arg) {
  // lazily require for perf :)
  return require('any-shell-escape')(arg)
}

/*
  eslint
    func-name-matching:0,
    global-require:0,
    import/no-dynamic-require:0
*/
