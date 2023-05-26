# envkeygo

Integrate [EnvKey](https://www.envkey.com) with your Go projects to keep api keys, credentials, and other configuration securely and automatically in sync for developers and servers.

This repo is mirrored in two locations:

- [A subdirectory of EnvKey's v2 monorepo](https://github.com/envkey/envkey/tree/main/public/sdks/languages-and-frameworks/go/envkeygo).
- [envkeygo module repo](https://github.com/envkey/envkeygo)

## Installation

```bash
go get github.com/envkey/envkeygo/v2
```

## Usage

If you haven't already, download and install EnvKey from our [website](https://envkey.com), then create a new org. Next, follow the ~1 minute [integration quickstart](https://docs-v2.envkey.com/docs/integration-quickstart) to init an app with a `.envkey` file (for connecting development) or generate a server `ENVKEY` (for connecting a server).

Now load your EnvKey configuration in `main.go`:

```go
// main.go
import (
  "os"
  _ "github.com/envkey/envkeygo/v2"
)

// assuming you have GITHUB_TOKEN set in EnvKey
token := os.Getenv("GITHUB_TOKEN") // this will stay in sync
```

### Overriding Vars

envkeygo will not overwrite existing environment variables or additional variables set in the `.env` file you loaded your `ENVKEY` from. This can be convenient for customizing environments that otherwise share the same configuration. You can also use [branches or local overrides](https://docs-v2.envkey.com/docs/branches-and-local-overrides) for this purpose.

### Working Offline

envkeygo can cache your encrypted config in development so that you can still use it while offline. Your config will still be available (though possibly not up-to-date) the next time you lose your internet connection. If you do have a connection available, envkeygo will always load the latest config. Your cached encrypted config is stored in `$HOME/.envkey/cache`

To turn on caching, set a `ENVKEY_SHOULD_CACHE=1` environment variable when running your program (_not_ in your EnvKey config):

```bash
ENVKEY_SHOULD_CACHE=1 ./your-program
```

## envkey-source

Using a language-specific library like this one is the easiest and fastest method of integrating with EnvKey. However, the [envkey-source](https://docs-v2.envkey.com/docs/envkey-source) executable, which this library wraps, provides additional options and functionality when used directly from the command line. Features such as automatic reloads and change hooks are not available in EnvKey's language-specific SDKs. If you're comfortable with the command line, need additional flexibility, or want to maximize EnvKey's potential, consider using envkey-source directly.

## ENVKEY / .env file / .envkey file resolution order and precedence

1. `ENVKEY` environment variable has highest precedence.

2. If neither `ENVKEY` environment variable isn't set, the library searches for either a `.env`(with an `ENVKEY` set) or a `.envkey` file (JSON with `orgId` and `appId` set), starting in the current directory then checking recursively upwards. The file found at the lowest depth (i.e., closest to the current directory) is chosen. If both files are found at the same depth, the `.env` file takes precedence.

3. If an `.envkey` or `.env` file with an `ENVKEY` set in it still hasn't been found, check for`.env` with `ENVKEY` present at `~/.env`.

4. If `.env` _without_ `ENVKEY` is found, overrides are still applied, unless an existing environment variable is already set, in which case that takes precedence. If an `.envkey` is found, no further lookup for `.env` above this location occurs.

## x509 error / ca-certificates

On a stripped down OS like Alpine Linux, you may get an `x509: certificate signed by unknown authority` error when attempting to load your config. You can fix it by ensuring that the `ca-certificates` dependency is installed. On Alpine you'll want to run:

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
