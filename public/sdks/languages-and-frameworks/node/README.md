# envkey npm package

Integrate [EnvKey](https://www.envkey.com) with your Node.js projects to keep api keys, credentials, and other configuration securely and automatically in sync for developers and servers.

## envkey-source

In EnvKey v2, using the [envkey-source](https://docs-v2.envkey.com/docs/envkey-source) executable from the command line offers additional functionality, like automatic reloads, that aren't available to EnvKey's language-specific SDKs. It's also faster and a lot smaller in size. Consider using it instead of this library if it fits your use case.

## Installation

```bash
npm install 'envkey' --save
```

## Usage

To load an EnvKey environment, follow the [integration quickstart](https://docs-v2.envkey.com/docs/integration-quickstart), but stop before integrating with envkey-source (which you won't be doing).

Then at the entry point of your application:

```javascript
// main.js
require("envkey");
```

Or if you're using TypeScript/ES6+ imports:

```javascript
// main.ts / main.js
import "envkey";
```

Now all your EnvKey variables will be available on `process.env`.

### Errors

The package will throw an error if an `ENVKEY` is missing or invalid.

### Overriding Vars

This package will not overwrite existing environment variables or additional variables set in the `.env` file you loaded your `ENVKEY` from. This can be convenient for customizing environments that otherwise share the same configuration. You can also use [branches or local overrides](https://docs-v2.envkey.com/docs/branches-and-local-overrides) for this purpose.

### Working Offline

This package caches your encrypted config in development so that you can still use it while offline. Your config will still be available (though possibly not up-to-date) the next time you lose your internet connection. If you do have a connection available, envkey will always load the latest config. Your cached encrypted config is stored in `$HOME/.envkey/cache`

For caching purposes, this package assumes you're in development mode if `process.env.NODE_ENV` is "development" or "test".

You can also turn on caching by setting a `ENVKEY_SHOULD_CACHE=1` environment variable when running your app (_not_ in your EnvKey config):

```bash
ENVKEY_SHOULD_CACHE=1 node your_app.js
```

### Custom Loading

If you want more control over how/when envkey loads your config, you can import/require the loader module directly instead of the top-level package that autoloads.

With require:

```javascript
const envkeyLoader = require("envkey/loader");

envkeyLoader.load({
  dotEnvFile: ".staging.env", // where to find the dotEnv file that contains your ENVKEY,
  permitted: ["KEY1", "KEY2"], // allow-list of permitted vars (useful for client-side config) - defaults to permitting all if omitted
});
```

Or with imports:

```javascript
import { load as envkeyLoad } from "envkey/loader";

envkeyLoad({ dotEnvFile: ".staging.env" });
```

You can also load your config asynchronously by providing a callback to the load function:

```javascript
const envkeyLoader = require("envkey/loader");

envkeyLoader.load(
  {
    dotEnvFile: ".staging.env", // where to find the dotEnv file that contains your ENVKEY,
    permitted: ["KEY1", "KEY2"], // allow-list of permitted vars (useful for client-side config) - defaults to permitting all if omitted
  },
  function (err, res) {
    console.log("Config loaded");
    console.log(process.env.KEY1);
  }
);
```

For even more flexibility, you can use the `fetch` method to return your config as simple json and do as you wish with it. As with `load`, it can be called synchronously or asynchronously.

```javascript
const envkeyLoader = require("envkey/loader");

// synchronous
const config = envkeyLoader.fetch({
  dotEnvFile: ".staging.env",
  permitted: ["KEY1", "KEY2"],
});
console.log(config.KEY1);

// asynchronous
envkeyLoader.fetch(
  {
    dotEnvFile: ".staging.env",
    permitted: ["KEY1", "KEY2"],
  },
  function (err, res) {
    console.log(res.KEY1);
  }
);
```

If you're using **TypeScript**, typings for the `load` and `fetch` functionas are included.

## Client-Side Config In The Browser

Since EnvKey is for configuration in addition to secrets, it can be convenient to inject a portion of your EnvKey config into your client-side code. This should be done by allow-listing variables that are safe for the client (i.e. can be made public) and injecting them during your build process. EnvKey has a [webpack plugin](https://github.com/envkey/envkey/public/sdks/languages-and-framworks/webpack) to help you do it right.

## envkey-source binaries

If you look in the `ext` directory of this package, you'll find a number of `envkey-source` binaries for various platforms and architectures. These are output by the [envkey-source Go library](https://github.com/envkey/envkey/public/sdks/envkey-source). It contains EnvKey's core cross-platform fetching, decryption, verification, web of trust, redundancy, and caching logic, and can also be used directly.

## x509 error / ca-certificates

On a stripped down OS like Alpine Linux, you may get an `x509: certificate signed by unknown authority` error when attempting to load your config. envkey-source tries to handle this by including its own set of trusted CAs via [gocertifi](https://github.com/certifi/gocertifi), but if you're getting this error anyway, you can fix it by ensuring that the `ca-certificates` dependency is installed. On Alpine you'll want to run:

```
apk add --no-cache ca-certificates
```

## Further Reading

For more on EnvKey in general:

Read the [docs](https://docs-v2.envkey.com).

Read the [integration quickstart](https://docs-v2.envkey.com/docs/integration-quickstart.html).

Read the [security and cryptography overview](https://docs-v2.envkey.com/docs/security).

## Need help? Have questions, feedback, or ideas?

Post an [issue](https://github.com/envkey/envkey/issues), start a [discussion](https://github.com/envkey/envkey/dicussions), or email us: [support@envkey.com](mailto:support@envkey.com).
