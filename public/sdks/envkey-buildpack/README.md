# envkey-buildpack

A buildpack for loading EnvKey variables before the main buildpack's compilation phase. Useful if you need some of you EnvKey config to be set during compilation--for example, when using NPM private modules, an NPM_TOKEN is required to install dependencies.

Requires that a valid ENVKEY is set prior to running this buildpack.

## Heroku

Example usage with heroku:

    $ heroku buildpacks:add --index 1 https://github.com/envkey/envkey-buildpack

    $ heroku config:set ENVKEY=...

    $ git push heroku master
    ...
    -----> EnvKey-enabled app detected
    -----> Attempting to load, decrypt, and export EnvKey variables
           ENVKEY config var is set
           Installing envkey-source...
           EnvKey variables exported

## fly.io

Example usage with fly.io:
