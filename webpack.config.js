const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

// mode is set via --mode flag on the CLI (e.g. webpack --mode production).
// Passing it explicitly here ensures a clear default for direct invocations.
module.exports = (_env, argv) => {
  const mode = argv.mode || 'development';
  const isProd = mode === 'production';

  const tsRule = { test: /\.ts$/, include: /src/, use: [{ loader: 'ts-loader' }] };

  return [
  {
    mode,
    entry: './src/main.ts',
    target: 'electron-main',
    module: { rules: [tsRule] },
    output: {path: path.resolve(__dirname, 'dist'), filename: 'main.js'},
    resolve: {extensions: ['.ts', '.js']},
    node: {__dirname: false, __filename: false},
    devtool: isProd ? false : 'source-map',
  },
  {
    mode,
    entry: './src/preload.ts',
    target: 'electron-preload',
    module: { rules: [tsRule] },
    output: {path: path.resolve(__dirname, 'dist'), filename: 'preload.js'},
    resolve: {extensions: ['.ts', '.js']},
    node: {__dirname: false, __filename: false},
    devtool: isProd ? false : 'source-map',
  },
  {
    mode,
    entry: './src/renderer.ts',
    target: 'electron-renderer',
    module: {
      rules: [
        tsRule,
        {test: /\.css$/, use: ['style-loader', 'css-loader']}
      ]
    },
    output: {path: path.resolve(__dirname, 'dist'), filename: 'renderer.js'},
    plugins: [
      new HtmlWebpackPlugin({template: './src/index.html'}),
      new CopyWebpackPlugin({
        patterns: [
          { from: 'src/vendor', to: 'vendor' }
        ]
      })
    ],
    resolve: {extensions: ['.ts', '.js']},
    devtool: isProd ? false : 'source-map',
  }
  ];
};