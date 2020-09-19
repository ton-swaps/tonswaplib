const path = require('path');
const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    app: './src/index.js',
  },
  node: {
    fs: 'empty'
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: './node_modules/ton-client-web-js/tonclient.wasm' }
      ],
    }),
    new webpack.LoaderOptionsPlugin({
      minimize: false,
      debug: true,
    }),
  ],
  output: {
    filename: 'tonswaplib.js',
    path: path.resolve(__dirname, 'dist'),
  }
};