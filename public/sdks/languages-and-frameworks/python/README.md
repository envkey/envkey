# envkey-python

Integrate [EnvKey](https://www.envkey.com) with your Python projects to keep API keys, credentials, and other configuration securely and automatically in sync for developers and servers.

Compatible with Python 2 and 3.

## Installation

```bash
$ pip install envkey
```

## Usage

If you haven't already, download and install EnvKey from our [website](https://envkey.com), then create a new org. Next, follow the ~1 minute [integration quickstart](https://docs-v2.envkey.com/docs/integration-quickstart) to init an app with a `.envkey` file (for connecting development) or generate a server `ENVKEY` (for connecting a server).

Then at the entry point of your application:

```python
import envkey
```

For **Django**, you should put the above in `manage.py` and `wsgi.py`. Also see the [note on casting below](#django-environ-casting) if you're migrating from `django-environ`.

Now all your EnvKey variables will be available in `os.environ`.

Or as a bit of syntactic sugar to avoid needing to always import `os` alongside `envkey`, you can call `envkey.get`, which delegates to `os.environ.get`. For example:

```python
import envkey

my_var = envkey.get("SOME_ENVKEY_VAR")

```

### Errors

The package will throw an error if an `ENVKEY` is missing or invalid.

### Overriding Vars

This package will not overwrite existing environment variables or additional variables set in the `.env` file you loaded your `ENVKEY` from. This can be convenient for customizing environments that otherwise share the same configuration. You can also use [branches or local overrides](https://docs-v2.envkey.com/docs/branches-and-local-overrides) for this purpose.

### Working Offline

This package can cache your encrypted config in development so that you can still use it while offline. Your config will still be available (though possibly not up-to-date) the next time you lose your internet connection. If you do have a connection available, envkey will always load the latest config. Your cached encrypted config is stored in `$HOME/.envkey/cache`

To turn on caching, set a `ENVKEY_SHOULD_CACHE=1` environment variable when running your program (_not_ in your EnvKey config):

```bash
ENVKEY_SHOULD_CACHE=1 python your_app.py
```

### Disabling autoload

If you'd like to have more control over how your config is loaded, you can prevent the package from auto-loading on import by setting `ENVKEY_DISABLE_AUTOLOAD=1` as an environment variable when running your program.

You can then load your config explicitly like this:

```python
import envkey

envkey.load(cache_enabled=True)
```

For even more flexibility, you can just fetch your config as a dict (without setting it on `os.environ`) like this:

```python
import envkey
import os

config = envkey.fetch_env(os.environ['ENVKEY'], cache_enabled=True)
```

### django-environ casting

If you happen to be migrating from `django-environ` to EnvKey, watch out for the fact that EnvKey _does not_ cast variables to booleans or any other non-string types as `django-environ` does. All variables set by EnvKey will be _strings_ in accordance with the cross-platform environment variable standard. See: https://twitter.com/manishsinhaha/status/1265746057377361921

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
