import webpack from "webpack";
import path from "path";
import "webpack-dev-server";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";

const plugins = [
  new webpack.DefinePlugin({
    "process.env": JSON.stringify({ NODE_ENV: "production" }),
  }),
];

const config: webpack.Configuration = {
  mode: "production",
  output: { filename: "[name].js", path: path.resolve(__dirname, "dist") },
  devtool: "source-map",
  module: {
    rules: [
      {
        test: /\.(ts|tsx|js|jsx)$/,
        use: [
          {
            loader: "ts-loader",
            options: { transpileOnly: true },
          },
        ],
        exclude: /node_modules/,
      },
      {
        test: /\.(woff2)$/,
        use: [
          {
            loader: "file-loader",
          },
        ],
      },
      {
        test: /\.svg$/,
        use: [
          {
            loader: "babel-loader",
            options: {
              presets: ["@babel/preset-react"],
            },
          },
          {
            loader: "react-svg-loader",
            options: {
              jsx: true, // true outputs JSX tags
            },
          },
        ],
      },
    ],
  },
  plugins,
  entry: {
    index: [path.resolve(__dirname, "src") + "/index.tsx"],
    stripe_form: [
      path.resolve(__dirname, "src", "stripe") + "/stripe_form.tsx",
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
    plugins: [new TsconfigPathsPlugin({ configFile: "tsconfig.json" })],
  },
};

export default config;
