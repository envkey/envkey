import * as path from "path";
import * as fs from "fs";
import * as webpack from "webpack";
import * as glob from "glob";
import CopyPlugin from "copy-webpack-plugin";

const extensionConfig: webpack.Configuration = {
  target: "node",
  mode: "none",
  entry: "./src/extension.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "extension.js",
    libraryTarget: "commonjs2",
  },
  externals: {
    vscode: "commonjs vscode",
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
          },
        ],
      },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [{ from: "node_modules/envkey/ext", to: "ext" }],
      options: {},
    }),
    {
      apply: (compiler: webpack.Compiler) => {
        compiler.hooks.afterEmit.tap("AfterEmitPlugin", (compilation) => {
          const outputPath = path.join(compiler.outputPath, "ext");
          const files = glob.sync(path.join(outputPath, "*/envkey-source"));
          for (const file of files) {
            fs.chmodSync(file, 0o755);
          }
        });
      },
    },
  ],
  devtool: "nosources-source-map",
  infrastructureLogging: {
    level: "log",
  },
};

module.exports = [extensionConfig];
