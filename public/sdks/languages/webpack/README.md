## envkey-webpack-plugin

A webpack plugin that wraps [EnvKey's](https://www.envkey.com) [Node.js library](https://www.github.com/envkey/envkey-node) so you can easily inject whitelisted configuration into your browser apps.

All vars will be available on `process.env` in the browser.

To make `process.env.NODE_ENV` available, just add it to the `permitted` whitelist (see below).

## Install

`npm i envkey-webpack-plugin --save-dev`

## Usage

```javascript
var webpack = require('webpack'),
    EnvkeyWebpackPlugin = require('envkey-webpack-plugin');

module.exports = {
  //...

  plugins: [
    new EnvkeyWebpackPlugin({

      permitted: ["STRIPE_PUBLISHABLE_KEY", "PUSHER_APP_KEY", "NODE_ENV"], // required, specify whitelist of vars to pull from Envkey -- you can also include "NODE_ENV" to make that available

      dotEnvFile: ".env", // optional, specify alternate dotenv file path like ".env.staging" -- file should include valid ENVKEY variable

      define: {ANOTHER_VAR: "anotherVal"} // optional, set additional vars on `process.env`

    })
  ]

 //...
}
```
