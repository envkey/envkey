# envkey-go

Integrate [EnvKey](https://www.envkey.com) with your Go projects to keep api keys, credentials, and other configuration securely and automatically in sync for developers and servers.

## Installation

```bash
go get github.com/envkey/envkeygo
```

## Usage

First, generate an `ENVKEY` in the [EnvKey App](https://github.com/envkey/envkey-app). Then set `ENVKEY=...`, either in a gitignored `.env` file in the root of your project (in development) or in an environment variable (on servers).

Then load your EnvKey configuration in `main.go`:

```go
// main.go
import (
  "os"
  _ "github.com/envkey/envkeygo"
)

// assuming you have GITHUB_TOKEN set in EnvKey
token := os.Getenv("GITHUB_TOKEN") // this will stay in sync
```

### Overriding Vars

envkeygo will not overwrite existing environment variables or additional variables set in a `.env` file. This can be convenient for customizing environments that otherwise share the same configuration. You can also use [sub-environments](https://blog.envkey.com/development-staging-production-and-beyond-85f26f65edd6) in the EnvKey App for this purpose.

### Working Offline

envkeygo caches your encrypted config in development so that you can still use it while offline. Your config will still be available (though possibly not up-to-date) the next time you lose your internet connection. If you do have a connection available, envkeygo will always load the latest config. Your cached encrypted config is stored in `$HOME/.envkey/cache`

For caching purposes, this package assumes you're in development mode if a `.env` file exists in the root of your project.

## x509 error / ca-certificates

On a stripped down OS like Alpine Linux, you may get an `x509: certificate signed by unknown authority` error when envkeygo attempts to load your config. [envkey-fetch](https://github.com/envkey/envkey-fetch) (which envkeygo wraps) tries to handle this by including its own set of trusted CAs via [gocertifi](https://github.com/certifi/gocertifi), but if you're getting this error anyway, you can fix it by ensuring that the `ca-certificates` dependency is installed. On Alpine you'll want to run:
```
apk add --no-cache ca-certificates
```

## Further Reading

For more on EnvKey in general:

Read the [docs](https://docs.envkey.com).

Read the [integration quickstart](https://docs.envkey.com/integration-quickstart.html).

Read the [security and cryptography overview](https://security.envkey.com).

## Need help? Have questions, feedback, or ideas?

Post an [issue](https://github.com/envkey/envkeygo/issues) or email us: [support@envkey.com](mailto:support@envkey.com).


