# envkey npm package

Integrate [EnvKey](https://www.envkey.com) with your Node.js projects to keep api keys, credentials, and other configuration securely and automatically in sync for developers and servers.

## Installation

```bash
npm install 'envkey' --save
```

Then at the entry point of your application:

```javascript
// main.js
require('envkey')
```

Or if you prefer ES6+ imports:

```javascript
// main.js
import 'envkey'
```

## Usage

Generate an `ENVKEY` in the [EnvKey App](https://github.com/envkey/envkey-app). Then set `ENVKEY=...`, either in a gitignored `.env` file in the root of your project (in development) or in an environment variable (on servers).

Now all your EnvKey variables will be available on `process.env`.

### Errors

The package will throw an error if an `ENVKEY` is missing or invalid.

### Example

Assume you have `STRIPE_SECRET_KEY` set to `sk_test_2a33b045e998d2ef60c7861d2ac22ea8` for the `development` environment in the EnvKey App. You generate a local development `ENVKEY`.

In your project's **gitignored** `.env` file:

```bash
# .env
ENVKEY=GsL8zC74DWchdpvssa9z-nk7humd7hJmAqNoA
```

In `lib/stripe.js`:

```javascript
var stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
```

Now `STRIPE_SECRET_KEY` will stay automatically in sync for all the developers on your team.

For a server, generate a server `ENVKEY` in the EnvKey App, then set the `ENVKEY` as an environment variable instead of putting it in a `.env` file.

Now your servers will stay in sync as well. If you need to rotate your `STRIPE_SECRET_KEY`, you can do it in a few seconds in the EnvKey App, restart your servers, and you're good to go. All your team's developers and all your servers will have the new value.

### Overriding Vars

The envkey package will not overwrite existing environment variables or additional variables set in a `.env` file. This can be convenient for customizing environments that otherwise share the same configuration. You can also use [sub-environments](https://blog.envkey.com/development-staging-production-and-beyond-85f26f65edd6) in the EnvKey App for this purpose.

### Working Offline

The envkey package caches your encrypted config in development so that you can still use it while offline. Your config will still be available (though possibly not up-to-date) the next time you lose your internet connection. If you do have a connection available, envkey will always load the latest config. Your cached encrypted config is stored in `$HOME/.envkey/cache`

For caching purposes, this package assumes you're in development mode if `process.env.NODE_ENV` is "development" or "test". If `process.env.NODE_ENV` is undefined, then it's assumed you're in development mode when a .env file exists in the root of your project.

### Custom Loading

If you want more control over how/when envkey loads your config, you can import/require the loader module directly instead of the top-level package that autoloads.

With require:

```javascript
const envkeyLoader = require('envkey/loader')

envkeyLoader.load({
  dotEnvFile: ".staging.env", // where to find the dotEnv file that contains your ENVKEY,
  permitted: ["KEY1", "KEY2"] // whitelist of permitted vars (useful for client-side config) - defaults to permitting all if omitted
})
```

Or with imports:

```javascript
import {load as envkeyLoad} from 'envkey/loader'

envkeyLoad({ dotEnvFile: ".staging.env" })
``` 

You can also load your config asynchronously by providing a callback to the load function:

```javascript
const envkeyLoader = require('envkey/loader')

envkeyLoader.load({
  dotEnvFile: ".staging.env", // where to find the dotEnv file that contains your ENVKEY,
  permitted: ["KEY1", "KEY2"] // whitelist of permitted vars (useful for client-side config) - defaults to permitting all if omitted
}, function(err, res){
  console.log("Config loaded")
  console.log(process.env.KEY1)
})
```

For even more flexibility, you can use the `fetch` method to return your config as simple json and do as you wish with it. As with `load`, it can be called synchronously or asynchronously.

```javascript
const envkeyLoader = require('envkey/loader')

// synchronous
const config = envkeyLoader.fetch({ 
  dotEnvFile: ".staging.env",
  permitted: ["KEY1", "KEY2"]
})
console.log(config.KEY1)

// asynchronous
envkeyLoader.fetch({
  dotEnvFile: ".staging.env",
  permitted: ["KEY1", "KEY2"]
}, function(err, res){
  console.log(res.KEY1)
})
```

## Client-Side Config In The Browser

Since EnvKey is for configuration in addition to secrets, it can be convenient to inject a portion of your EnvKey config into your client-side code. This should be done by whitelisting variables that are safe for the client (i.e. can be made public) and injecting them during your build process. EnvKey has a [webpack plugin](https://github.com/envkey/envkey-webpack-plugin) to help you do it right.

## envkey-fetch binaries

If you look in the `ext` directory of this package, you'll find a number of `envkey-fetch` binaries for various platforms and architectures. These are output by the [envkey-fetch Go library](https://github.com/envkey/envkey-fetch). It contains EnvKey's core cross-platform fetching, decryption, verification, web of trust, redundancy, and caching logic. It is completely open source.

## x509 error / ca-certificates

On a stripped down OS like Alpine Linux, you may get an `x509: certificate signed by unknown authority` error when `envkey-node` attempts to load your config. [envkey-fetch](https://github.com/envkey/envkey-fetch) attempts to handle this by including its own set of trusted CAs via [gocertifi](https://github.com/certifi/gocertifi), but if you're getting this error anyway, you can fix it by ensuring that the `ca-certificates` dependency is installed. On Alpine you'll want to run:
```
apk add --no-cache ca-certificates
```

## Further Reading

For more on EnvKey in general:

Read the [docs](https://docs.envkey.com).

Read the [integration quickstart](https://docs.envkey.com/integration-quickstart.html).

Read the [security and cryptography overview](https://security.envkey.com).

## Need help? Have questions, feedback, or ideas?

Post an [issue](https://github.com/envkey/envkey-ruby/issues) or email us: [support@envkey.com](mailto:support@envkey.com).

