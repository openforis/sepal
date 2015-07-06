const Webpack = require('webpack')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
    entry: './src/main/app.js',
    output: {
        path: __dirname + '/dist',
        filename: 'bundle-[hash].js'
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: 'index.html',
            hash: true
        }),
        new Webpack.ProvidePlugin({
            riot: 'riot'
        })
    ],
    resolve: {
        modulesDirectories: ["src", "node_modules"]
    },
    devtool: 'source-map',
    module: {
        preLoaders: [
            {test: /\.tag$/, exclude: /node_modules/, loader: 'riotjs-loader', query: {type: 'none'}}
        ],
        loaders: [
            {test: /\.js|\.tag$/, exclude: /node_modules/, loader: 'babel-loader'},
            {test: /\.css$/, loader: "style!css"}
        ]
    },
    devServer: {
        contentBase: './dist',
        proxy: {
            '*': {target: 'http://localhost:9999'}
        }
    }
}