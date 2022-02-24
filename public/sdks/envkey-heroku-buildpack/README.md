# envkey-heroku-buildpack

A buildpack for supplying EnvKey variables to your Heroku apps, and making the `envkey-source` executable available to use in your `Procfile`. Also makes your EnvKey variables available to subsequent buildpacks.

Requires that a valid ENVKEY config var is set prior to running the buildpack.

## Example Usage

Example usage with Heroku:

    $ heroku buildpacks:add --index 1 https://github.com/envkey/envkey/public/sdks/envkey-heroku-buildpack
    $ heroku buildpacks:add --index 2 heroku/python

    $ heroku config:set ENVKEY=...

    $ git push heroku master
