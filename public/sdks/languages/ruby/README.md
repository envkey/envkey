# envkey gem

Integrate [EnvKey](https://www.envkey.com) with your Ruby or Ruby On Rails projects to keep api keys, credentials, and other configuration securely and automatically in sync for developers and servers.

## Installation

In your Gemfile:

```ruby
gem 'envkey'
```

If you're using Rails, that's all you need. In plain Ruby, you need to require envkey at the entry point of your application.

```ruby
require 'envkey'
```

## Usage

Generate an `ENVKEY` in the [EnvKey App](https://github.com/envkey/envkey-app). Then set `ENVKEY=...`, either in a gitignored `.env` file in the root of your project (in development) or in an environment variable (on servers).

Now all your EnvKey variables will be available on `ENV`.

### Errors

The gem will throw an error if an `ENVKEY` is missing or invalid.

### Example

Assume you have `STRIPE_SECRET_KEY` set to `sk_test_2a33b045e998d2ef60c7861d2ac22ea8` for the `development` environment in the EnvKey App. You generate a local development `ENVKEY`.

In your project's **gitignored** `.env` file:

```bash
# .env
ENVKEY=GsL8zC74DWchdpvssa9z-nk7humd7hJmAqNoA
```

In `config/initializers/stripe.rb`:

```ruby
Stripe.api_key = ENV.fetch("STRIPE_SECRET_KEY")
```

Now `STRIPE_SECRET_KEY` will stay automatically in sync for all the developers on your team.

For a server, generate a server `ENVKEY` in the EnvKey App, then set the `ENVKEY` as an environment variable instead of putting it in a `.env` file.

Now your servers will stay in sync as well. If you need to rotate your `STRIPE_SECRET_KEY` you can do it in a few seconds in the EnvKey App, restart your servers, and you're good to go. All your team's developers and all your servers will have the new value.

### Overriding Vars

The envkey gem will not overwrite existing environment variables or additional variables set in a `.env` file. This can be convenient for customizing environments that otherwise share the same configuration. You can also use [sub-environments](https://blog.envkey.com/development-staging-production-and-beyond-85f26f65edd6) in the EnvKey app for this purpose.

### Working Offline

The envkey gem caches your encrypted config in development so that you can still use it while offline. Your config will still be available (though possibly not up-to-date) the next time you lose your internet connection. If you do have a connection available, envkey will always load the latest config. Your cached encrypted config is stored in `$HOME/.envkey/cache`

For caching purposes, the gem assumes you're in development mode if either `ENV["RAILS_ENV"]` or `ENV["RACK_ENV"]` is `"development"` or `"test"`. If you aren't using Rails or Rack, then it's assumed you're in development mode when a `.env` file exists in the root of your project.

## envkey-source binaries

If you look in the `ext` directory of this gem, you'll find a number of `envkey-source` binaries for various platforms and architectures. These are output by the [envkey-source Go library](https://github.com/envkey/envkey-source). It contains EnvKey's core cross-platform fetching, decryption, verification, web of trust, redundancy, and caching logic. It is completely open source.

## x509 error / ca-certificates

On a stripped down OS like Alpine Linux, you may get an `x509: certificate signed by unknown authority` error when the envkey gem attempts to load your config. [envkey-source](https://github.com/envkey/envkey-source) tries to handle this by including its own set of trusted CAs via [gocertifi](https://github.com/certifi/gocertifi), but if you're getting this error anyway, you can fix it by ensuring that the `ca-certificates` dependency is installed. On Alpine you'll want to run:

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
