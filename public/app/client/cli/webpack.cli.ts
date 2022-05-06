import path from "path";
import os from "os";
import webpack from "webpack";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";

let { WEBPACK_OUTPUT_DIR } = process.env;
if (!WEBPACK_OUTPUT_DIR) {
  WEBPACK_OUTPUT_DIR = path.resolve(__dirname, "build");
  console.log("fallback webpack output to", WEBPACK_OUTPUT_DIR);
}

// yargs doesn't pick it up inside the pkg file so it gets baked into env var
const { version } = require("./package.json");

const externals = {
  // https://github.com/websockets/ws/issues/1126#issuecomment-476246113
  // ws package for browser - unnecessary packages
  bufferutil: "bufferutil",
  "utf-8-validate": "utf-8-validate",
};

if (os.platform() === "linux") {
  // keytar needs libsecret-1-0 so we just fallback to the OS.
  // @ts-ignore
  externals.keytar = "keytar";
}

module.exports = {
  mode: "production",
  entry: {
    "envkey-cli": "./src/index.ts",
    "envkey-core": "./src/cli_core_proc.ts",
  },
  devtool: "source-map",
  target: "node",
  optimization: {
    // since final tar.gz isn't different with terser enabled, we're disabling it due to out-of-memory error in Terser.
    // Also, the fonts that are included via the core process, via the UI, are too large and mangle.reserved[] isn't clearly
    // enough documented to get working at this time.
    minimize: false,
  },
  stats: {
    warningsFilter: [
      // Ignore warnings due to yarg's dynamic module loading
      // https://github.com/yargs/yargs/commit/9adf22e7f7f3555bf87f9762483a9e61843b8faf#diff-e3e2a9bfd88566b05001b02a3f51d286
      // see also https://github.com/yargs/yargs/blob/master/docs/bundling.md#webpack
      /node_modules\/yargs/,
      // and express `Critical dependency: the request of a dependency is an expression` due to similar dynamic require
      /node_modules\/express/,
      // `Critical dependency: the request of a dependency is an expression` due to dynamic file system require
      /node_modules\/colors/,
      // `Critical dependency: the request of a dependency is an expression` due to dynamic DB ORM adapter require, which is
      // unused as we only hit APIs with is-reachable
      /node_modules\/is-reachable\/node_modules\/keyv/,
    ],
  },
  externals,
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: "ts-loader",
        exclude: /node_modules/,
        options: {
          transpileOnly: true,
        },
      },
      {
        test: /\.node$/,
        loader: "native-ext-loader",
      },
    ],
  },
  plugins: [
    new webpack.EnvironmentPlugin({
      NODE_ENV: "production",
      ENVKEY_CLI_BUILD_VERSION: version,
      ENVKEY_CLI_BUILD_TIME: Date.now(),
    }),
  ],
  resolve: {
    extensions: [".tsx", ".ts", ".js", ".cjs", ".json"], // cjs+json needed for yargs
    plugins: [new TsconfigPathsPlugin({ configFile: "tsconfig.json" })],
  },
  output: {
    filename: "[name].js",
    path: WEBPACK_OUTPUT_DIR,
  },
};
