var path = require('path'),
    os = require('os'),
    fs = require('fs'),
    childProcess = require('child_process'),
    execFile = childProcess.execFile,
    execFileSync = childProcess.execFileSync

var ENVKEY_SOURCE_VERSION = "2.3.0"
var ENVKEY_VERSION = "2.3.2"

function keyError(){
  return "ENVKEY invalid. Couldn't load vars."
}

function throwKeyError(){
  var err = keyError()
  throw err
}

function pickPermitted(vars, opts){
  if (opts && opts.permitted && opts.permitted.length){
    var res = {}
    for (k in vars){
      if (opts.permitted.indexOf(k) != -1){
        res[k] = vars[k]
      }
    }
    return res
  } else {
    return vars
  }
}

function applyVarsToEnv(vars){
  var varsSet = {}
  for (k in vars){
    if(!process.env.hasOwnProperty(k)){
      var val = vars[k]
      process.env[k] = val
      varsSet[k] = val
    }
  }

  return varsSet
}


function load(optsOrCb, maybeCb){
  var opts = typeof optsOrCb == "object" ? optsOrCb : {},
      cb = typeof optsOrCb == "function" ? optsOrCb : maybeCb;

  if (cb){
    fetch(opts, function(err, vars){
      if(err){
        cb(err)
      } else {
        cb(null, applyVarsToEnv(vars))
      }
    })
  } else {
    return applyVarsToEnv(fetch(opts))
  }
}

function fetch(optsOrCb, maybeCb){
  var opts, cb

  if (typeof optsOrCb == "object"){
    opts = optsOrCb
  } else {
    opts = {}
  }

  if (typeof optsOrCb == "function"){
    cb = optsOrCb
  } else {
    cb = maybeCb
  }

  var platform = os.platform(),
      arch = os.arch(),
      platformPart,
      archPart

  switch (platform){
    case 'darwin':
    case 'linux':
      platformPart = platform
      break
    case 'freebsd':
    case 'openbsd':
      platformPart = "freebsd"
      break
    case 'win32':
      platformPart = "windows"
      break
    default:
      platformPart = "linux"
  }

  switch (arch){
    case 'ia32':
    case 'x32':
    case 'x86':
    case 'mips':
    case 'mipsel':
    case 'ppc':
    case 's390':
      archPart = "386"
      break
    case 'x64':
    case 'ppc64':
    case 's390x':
      archPart = "amd64"
      break
    case 'arm64':
    case 'aarch64':
      archPart = "arm64"
      break
    default:
      archPart = "amd64"
  }

  if (archPart == "386"){
    throw new Error("envkey-node only supports 64-bit systems.")
  }


  var isDev = false
  if (process.env.NODE_ENV && ["development", "test"].indexOf(process.env.NODE_ENV) > -1){
    isDev = true
  }

  var shouldCache = typeof opts.shouldCache == "undefined" ? (isDev || process.env.ENVKEY_SHOULD_CACHE) : opts.shouldCache;

  var ext = platformPart == "windows" ? ".exe" : "",
      filePath = path.join(__dirname, "ext", ["envkey-source", ENVKEY_SOURCE_VERSION, platformPart, archPart].join("_"), ("envkey-source" + ext)),
      execArgs = ["--json", (shouldCache ? "--cache" : ""), "--client-name", "envkey-node", "--client-version", ENVKEY_VERSION]

  if (opts.dotEnvFile){
    execArgs.push("--env-file")
    execArgs.push(opts.dotEnvFile)
  }

  if (cb){
    execFile(filePath, execArgs, { env: process.env }, function(err, stdoutStr, stderrStr){
      if (err){
        cb(stderrStr.replace(/echo 'error: /g, "").replace(/'; false/g, ""))
      } else if (stdoutStr.indexOf("error: ") == 0){
        cb(stdoutStr)
      } else {
        var json = JSON.parse(stdoutStr)
        cb(null, pickPermitted(json, opts))
      }
    })

  } else {
    try {
      var res = execFileSync(filePath, execArgs, { env: process.env}).toString()

      if(!res || !res.trim()){
        throwKeyError()
      }

      var json = JSON.parse(res.toString())

      if(!json){
        throwKeyError()
      }

      return pickPermitted(json, opts)
    } catch (e){
      if (e.stderr){
        const err = e.stdout.toString().replace(/echo 'error: /g, "").replace(/'; false/g, "")
        console.error(err)
        throw(err)
      } else {
        console.error(e.stack)
        throw(e)
      }
    }
  }
}

module.exports = { load: load, fetch: fetch, ENVKEY_VERSION: ENVKEY_VERSION}
