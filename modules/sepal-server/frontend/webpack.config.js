const Webpack               = require( 'webpack' )
const HtmlWebpackPlugin     = require( 'html-webpack-plugin' )
const ExtractTextPlugin     = require( 'extract-text-webpack-plugin' )
const autoprefixer          = require( 'autoprefixer' )
const FaviconsWebpackPlugin = require( 'favicons-webpack-plugin' )

module.exports = {
    entry  : [
        'font-awesome-loader',
        'bootstrap-loader/extractStyles',
        'tether',
        './src/components/main/app.js'
    ],
    output : {
        path    : __dirname + '/dist',
        filename: 'static/sepal-[hash].js'
    },
    plugins: [
        new HtmlWebpackPlugin( {
            template: 'index.html',
            hash    : true
        } ),
        new ExtractTextPlugin( { filename: 'static/sepal-[hash].css', allChunks: true } ),
        new Webpack.ProvidePlugin( { "window.Tether": "tether" } ),
        new Webpack.ProvidePlugin( {
            $              : "jquery",
            jQuery         : "jquery",
            "window.jQuery": "jquery",
            "window.Tether": "tether",
            // exports workaround for https://github.com/shakacode/bootstrap-loader/issues/172
            Alert          : "exports?Alert!bootstrap/js/dist/alert",
            Button         : "exports?Button!bootstrap/js/dist/button",
            Carousel       : "exports?Carousel!bootstrap/js/dist/carousel",
            Collapse       : "exports?Collapse!bootstrap/js/dist/collapse",
            Dropdown       : "exports?Dropdown!bootstrap/js/dist/dropdown",
            Modal          : "exports?Modal!bootstrap/js/dist/modal",
            Popover        : "exports?Popover!bootstrap/js/dist/popover",
            Scrollspy      : "exports?Scrollspy!bootstrap/js/dist/scrollspy",
            Tab            : "exports?Tab!bootstrap/js/dist/tab",
            Tooltip        : "exports?Tooltip!bootstrap/js/dist/tooltip",
            Util           : "exports?Util!bootstrap/js/dist/util"
        } ),
        new FaviconsWebpackPlugin( './src/icons/favicon.png' )
    ],
    resolve: { extensions: [ '', '.js' ] },
    devtool: 'source-map',
    module : {
        loaders: [
            {
                test  : /\.css$/,
                loader: ExtractTextPlugin.extract( { fallbackLoader: 'style', loader: 'css!postcss' } )
            },
            {
                test  : /\.scss$/,
                loader: ExtractTextPlugin.extract( { fallbackLoader: 'style', loader: 'css!postcss!sass' } )
            },
            {
                test  : /\.woff2?(\?v=[0-9]\.[0-9]\.[0-9])?$/,
                // Limiting the size of the woff fonts breaks font-awesome ONLY for the extract text plugin
                // loader: "url?limit=10000"
                loader: "url"
            },
            {
                test  : /\.(ttf|eot|svg)(\?[\s\S]+)?$/,
                loader: 'file'
            },
            {
                test  : /\.less$/,
                loader: "style!css!less"
            },
            // inline base64 URLs for <=8k images, direct URLs for the rest
            { test: /\.(png|jpg)$/, loader: 'url-loader?limit=8192&name=/static/[name].[ext]' },
            { test: /bootstrap\/dist\/js\/umd\//, loader: 'imports?jQuery=jquery' },
            { test: /\.html$/, loader: "underscore-template-loader" }
        ]
    },
    node   : {
        fs: "empty"
    },
    postcss: [ autoprefixer ],
    
    devServer: {
        contentBase: './dist',
        host       : '0.0.0.0',
        proxy      : {
            // '*': { target: 'http://localhost:8001', secure: false, changeOrigin: true }
            '*': { target: 'http://localhost:9999' }
            // '*': { target: 'https://vagrant', secure: false } // Vagrant box
            // , '/preview': { target: 'http://127.0.0.1:5000' }
        }
    }
}