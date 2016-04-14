const Webpack = require('webpack')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const autoprefixer = require('autoprefixer');

module.exports = {
    entry: [
        'font-awesome-loader',
        'bootstrap-loader/extractStyles',
        'tether',
        './src/components/main/app.js'
    ],
    output: {
        path: __dirname + '/dist',
        filename: 'sepal-[hash].js'
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: 'index.html',
            hash: true
        }),
        new ExtractTextPlugin('app.css', {allChunks: true}),
        new Webpack.ProvidePlugin({"window.Tether": "tether"}),
        new Webpack.ProvidePlugin({
            $: "jquery",
            jQuery: "jquery"
        })
    ],
    resolve: {extensions: ['', '.js']},
    devtool: 'source-map',
    module: {
        loaders: [
            {test: /\.css$/, loader: ExtractTextPlugin.extract('style', 'css!postcss')},
            {test: /\.scss$/, loader: ExtractTextPlugin.extract('style', 'css!postcss!sass')},

            {
                test: /\.woff2?(\?v=[0-9]\.[0-9]\.[0-9])?$/,
                // Limiting the size of the woff fonts breaks font-awesome ONLY for the extract text plugin
                // loader: "url?limit=10000"
                loader: "url"
            },
            {
                test: /\.(ttf|eot|svg)(\?[\s\S]+)?$/,
                loader: 'file'
            },
            {test: /bootstrap\/dist\/js\/umd\//, loader: 'imports?jQuery=jquery'},
            {test: /\.html$/, loader: "underscore-template-loader"}
        ]
    },

    postcss: [autoprefixer],

    devServer: {
        contentBase: './dist',
        proxy: {
            '*': {target: 'http://localhost:9999'}
        }
    }
}