var path = require('path'),
    os = require('os'),
    childProcess = require('child_process'),
    execFile = childProcess.execFile,
    execFileSync = childProcess.execFileSync,
    net = require('net');

var ENVKEY_SOURCE_VERSION = "2.4.1"
var ENVKEY_VERSION = "2.5.0"

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

  if (opts.memCache || opts.onChange){
    execArgs.push("--mem-cache")
  }

  function connectAndListenTCP (envkey, initialEnv) {
    // Create a unique ID for the connection -- just used for differentiating clients so
    // doesn't need to be cryptographically secure
    const connId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0,
            v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
    const composite = [envkey, connId].join("|");

    // Establish a TCP connection to the daemon
    const client = new net.Socket();
    client.connect(19410, '127.0.0.1', function() {
      // Write the composite to the socket
      client.write(composite + "\n");
    });

    // Listen for messages from the daemon
    currentEnv = initialEnv;
    client.on('data', function(data) {
      const msg = data.toString().trim();

      if (msg == "env_update"){
        execFile(filePath, execArgs, { env: process.env, cwd: opts.cwd }, function(err, stdoutStr, stderrStr){       
          if (!err && stdoutStr.indexOf("error: ") != 0){
            var json = JSON.parse(stdoutStr)
            var previousEnv = currentEnv;
            currentEnv = pickPermitted(json, opts)

            var changedKeys = [];
            for (var k in currentEnv){
              if (currentEnv[k] != previousEnv[k]){
                changedKeys.push(k);
              }
            }
            for (var k in previousEnv){
              if (typeof currentEnv[k] == "undefined"){
                changedKeys.push(k);
              }
            }

            opts.onChange(currentEnv, previousEnv, changedKeys);
          }
        }) 
      }
    });

    // Handle errors
    client.on('error', function(err) {
      console.error("EnvKey: onChange watcher error--lost TCP connection to envkey-source daemon:" + err);
    });

  }
  
  function setupWatcherIfNeeded (initialEnv){
    if (!opts.onChange){
      return;
    }
    // resolve ENVKEY from envkey-source, then connect to envkey-source daemon via TCP and listen for updates      
    execFile(filePath, ["--resolve-envkey"], { env: process.env, cwd: opts.cwd }, function(err, stdoutStr, stderrStr){
      if (!err && stdoutStr){
        const envkey = stdoutStr;
        connectAndListenTCP(envkey, initialEnv)
      } else {
        console.error("EnvKey: error setting up onChange watcher--couldn't resolve ENVKEY: " + err)
      }
    })    
  }
  

  if (cb){
    execFile(filePath, execArgs, { env: process.env, cwd: opts.cwd }, function(err, stdoutStr, stderrStr){
      
      if (err){
        cb(stderrStr.replace(/echo 'error: /g, "").replace(/'; false/g, ""))
      } else if (stdoutStr.indexOf("error: ") == 0){
        cb(stdoutStr)
      } else {
        var json = JSON.parse(stdoutStr)
        var permitted = pickPermitted(json, opts)

        cb(null, permitted)
        setupWatcherIfNeeded(permitted)        
      }
      
    })

  } else {
    try {
      var res = execFileSync(filePath, execArgs, { env: process.env, cwd: opts.cwd}).toString()

      if(!res || !res.trim()){
        throwKeyError()
      }

      var json = JSON.parse(res.toString())

      if(!json){
        throwKeyError()
      }

      var permitted = pickPermitted(json, opts)

      setupWatcherIfNeeded(permitted)

      return permitted
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
