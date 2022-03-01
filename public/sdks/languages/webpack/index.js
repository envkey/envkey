var webpack = require('webpack'),
    envkey = require('envkey/loader')

module.exports = EnvkeyWebpackPlugin

function EnvkeyWebpackPlugin(opts) {
  envkey.load(opts)

  var defineParams = {}

  if (!opts.permitted || !opts.permitted.length){
    throw new Error("'permitted' key required to specifiy vars whitelisted for client.")
  }

  for (k of opts.permitted) defineParams[k] = JSON.stringify(process.env[k])

  if (opts.define){
    for (k in opts.define){
      defineParams[k] = JSON.stringify(opts.define[k])
    }
  }

  return new webpack.DefinePlugin({"process.env": defineParams})
}