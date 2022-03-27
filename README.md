Welcome to the [EnvKey](https://www.envkey.com) v2 monorepo! All EnvKey's open source code lives here.

## End-To-End Encrypted Environments

- Fixes configuration sprawl and sloppy secrets management.

- Prevents breaches and outages.

- Saves countless engineer-hours.

![EnvKey UI](https://user-images.githubusercontent.com/545350/150350438-44ff380c-c346-41d0-8e39-f41e9ad73110.png)

![EnvKey CLI](https://user-images.githubusercontent.com/545350/150350715-c7c1ca15-ac37-406c-bc29-c8d922542d2f.gif)

## Easy integration

```bash
$ envkey-source -- any-shell-command
# That's it! Your command runs with the latest environment variables.

$ es -- any-shell-command
# To type less, use the `es` alias.

$ es -- ping '$DATABASE_URL'
# You can reference EnvKey variables in your shell command by wrapping them in single quotes.

$ es -w -- ./start-server
# Your server automatically restarts when there's a change.

$ es -w --rolling -- ./start-server
# Avoid downtime with rolling reloads across all connected processes.

$ es -r ./reload-env -- ./start-server
# Run custom reload logic when there's a change.

$ eval "$(es)"
# Set environment variables in the current shell.

$ echo $'\n\neval "$(es --hook bash)"\n' >> ~/.bash_profile
# Auto-load the latest environment in any EnvKey-enabled directory.
```

Check out the [integration quickstart](https://docs-v2.envkey.com/docs/integration-quickstart) for more details.

The cross-platform [envkey-source](https://docs-v2.envkey.com/docs/envkey-source) tool works with any language and offers the most integration options.

That said, language-specific wrappers are also available for [Node.js](https://github.com/envkey/envkey/tree/main/public/sdks/languages-and-frameworks/node), [Go](https://github.com/envkey/envkey/tree/main/public/sdks/languages-and-frameworks/go), [Python](https://github.com/envkey/envkey/tree/main/public/sdks/languages-and-frameworks/python), and [Ruby](https://github.com/envkey/envkey/tree/main/public/sdks/languages-and-frameworks/ruby).

## Why EnvKey?

- Open source, cross-platform, language-agnostic, end-to-end encrypted with NaCl.

- Set environment variables + manage apps, environments, branches, servers, people, devices, and access control **all in one place.**

- User-friendly UI + developer-friendly CLI.

- Easy integration wherever you need it.

- Cloud + self-hosting options.

- Version control, audit logs, re-usable blocks, branches, environment inheritance, customizable environments, local development environments, change hooks, device-based auth, OS keyring integration, and more.

## Install

You can download the latest versions of the EnvKey UI and CLI for your platform by going to [EnvKey's homepage](https://www.envkey.com) and clicking the big Download button at the top of the page. Install it when it's finished downloading.

The first time you open the app, [EnvKey's CLI](https://docs-v2.envkey.com/docs/cli-overview) and the [envkey-source](https://docs-v2.envkey.com/docs/envkey-source) integration tool will also be installed for you. Both can also be installed individually on a server.

You can also go to [releases](https://github.com/envkey/envkey/releases) in this repo and find the latest release of `envkey-desktop` for your platform.

Here's a [quick overview on verifying releases with minisign](https://docs-v2.envkey.com/docs/verifying-releases).

## Docs

Check out the [docs](https://docs-v2.envkey.com), including a brief [getting started overview](https://docs-v2.envkey.com/docs/getting-started).

## Coming from v1?

Check out the [v1 migration overview](https://docs-v2.envkey.com/docs/migrating-from-v1)

## Security

Read our [security overview](https://docs-v2.envkey.com/docs/security).

## Status

See the [current status of our services here](https://status.envkey.com).

## Bugs

Please [post an issue](https://github.com/envkey/envkey/issues) if you encounter a bug, even a small one. We'll do our best to fix it as soon as possible.

## Discussion and Community

[Jump in](https://github.com/envkey/envkey/discussion) and ask a question, leave some feedback, ask for new features, or help out another EnvKey user.

## Support

Email us: support@envkey.com

Business plans include priority support.

## License

All the code in this repo is free and open source under the MIT License.

EnvKey's Cloud and Enterprise Self-Hosted products include commercially licensed server-side extensions for battle-ready infrastructure and advanced user management.

## Contributing

Contributions to EnvKey are welcome, though we can't guarantee that we'll be able to accept or review every contribution.

Before submitting a pull request, we suggest starting a discussion to get feedback and buy-in from the core team and community. This will greatly improve the chances that your PR will be reviewed and accepted.

## Development

[Here's an overview on setting up a dev environment](https://docs-v2.envkey.com/docs/development) to work on EnvKey.
