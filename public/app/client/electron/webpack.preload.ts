import * as path from "path";
import * as webpack from "webpack";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";
const env = process.env.NODE_ENV ?? "development";

console.log("electron preload script webpack env:", env);

const config: webpack.Configuration = {
  mode: "production",
  entry: { preload: "./src/preload.ts" },
  target: "electron-preload",
  optimization: { minimize: false },
  devtool: "hidden-source-map",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: "ts-loader",
            options: {
              transpileOnly: true,
            },
          },
        ],
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".ts"],
    plugins: [new TsconfigPathsPlugin({ configFile: "tsconfig.json" })],
  },
  output: {
    filename: "[name].js",
    path: path.resolve(__dirname, "dist"),
  },
};

export default config;
