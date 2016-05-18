const Webpack           = require( 'webpack' )
const HtmlWebpackPlugin = require( 'html-webpack-plugin' )
const ExtractTextPlugin = require( 'extract-text-webpack-plugin' );
const autoprefixer      = require( 'autoprefixer' );

module.exports = {
    entry: [
        'font-awesome-loader',
        'bootstrap-loader/extractStyles',
        'tether',
        './src/components/main/app.js'
    ],
    output: {
        path: __dirname + '/dist',
        filename: 'static/sepal-[hash].js'
    },
    plugins: [
        new HtmlWebpackPlugin( {
            template: 'index.html',
            hash: true
        } ),
        new ExtractTextPlugin( 'static/app.css', { allChunks: true } ),
        new Webpack.ProvidePlugin( { "window.Tether": "tether" } ),
        new Webpack.ProvidePlugin( {
            $: "jquery",
            jQuery: "jquery",
            "window.jQuery": "jquery"
        } )
    ],
    resolve: { extensions: [ '', '.js' ] },
    devtool: 'source-map',
    module: {
        loaders: [
            { test: /\.css$/, loader: ExtractTextPlugin.extract( 'style', 'css!postcss' ) },
            { test: /\.scss$/, loader: ExtractTextPlugin.extract( 'style', 'css!postcss!sass' ) },

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
            // inline base64 URLs for <=8k images, direct URLs for the rest
            { test: /\.(png|jpg)$/, loader: 'url-loader?limit=8192&name=/static/[name]-[hash].[ext]' },
            { test: /bootstrap\/dist\/js\/umd\//, loader: 'imports?jQuery=jquery' },
            { test: /\.html$/, loader: "underscore-template-loader" }
        ]
    },
    node: {
        fs: "empty"
    },
    postcss: [ autoprefixer ],

    devServer: {
        contentBase: './dist',
        host: '0.0.0.0',
        proxy: {
            // '*': { target: 'http://localhost:1025' }
            // '*': { target: 'http://localhost:9999' }
            '*': { target: 'https://172.28.128.3' } // Vagrant box

        }
    }
}