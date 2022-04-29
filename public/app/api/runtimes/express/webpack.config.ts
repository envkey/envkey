import path from "path";
import webpack from "webpack";
import TerserPlugin from "terser-webpack-plugin";
import WebpackBuildNotifierPlugin from "webpack-build-notifier";

const externals = [
  // https://github.com/websockets/ws/issues/1126#issuecomment-476246113
  // ws package for browser - unnecessary packages
  "bufferutil",
  "utf-8-validate",
  // mysql2 optional dep
  "cardinal",
  // dynamic dependency of mysql2
  "mysql",
];

const willMinimize = process.env.ENVKEY_API_WEBPACK_DISABLE_MINIFY != "1";
if (willMinimize) {
  console.log("Webpack will minify api code");
} else {
  console.log(
    "API code minification disabled via ENVKEY_API_WEBPACK_DISABLE_MINIFY"
  );
}

const config: webpack.Configuration = {
  mode: "production",
  entry: {
    "api.community": "./src/main_api_community.ts",
  },
  target: "node",
  devtool: "source-map",
  externals,
  stats: {
    warningsFilter: [
      // and express `Critical dependency: the request of a dependency is an expression` due to similar dynamic require
      /node_modules\/express/,
      // knex Critical dependency: the request of a dependency is an expression
      /import-file/,
    ],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: "ts-loader",
        options: {
          transpileOnly: true,
        },
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
    alias: {
      "@core": path.resolve(__dirname, "../../../core/src/"),
      "@core_proc": path.resolve(
        __dirname,
        "../../../client/core_process/src/"
      ),
      "@infra": path.resolve(__dirname, "../../infra/src/"),
    },
  },
  plugins: [
    new webpack.EnvironmentPlugin({
      NODE_ENV: "production",
    }),
    new WebpackBuildNotifierPlugin({
      title: "EnvKey Api Webpack Build",
      sound: false,
      successSound: false,
      failureSound: false,
    }),
    // https://github.com/knex/knex/issues/1446#issuecomment-399296815
    // force unused dialects to resolve to the only one we use
    // and for whom we have the dependencies installed
    ...["mssql", "oracle", "oracledb", "postgres", "redshift", "sqlite3"].map(
      (dialect) => new webpack.IgnorePlugin(new RegExp(dialect), /\/knex\//)
    ),
  ],
  optimization: {
    minimize: willMinimize,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          ecma: 6,
        },
      }),
    ],
  },
  output: {
    filename: "[name].js",
    path: path.resolve(__dirname, "build"),
    library: "",
    libraryTarget: "commonjs",
  },
};

module.exports = config;
