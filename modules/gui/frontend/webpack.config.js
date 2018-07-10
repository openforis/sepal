const Webpack               = require( 'webpack' )
const HtmlWebpackPlugin     = require( 'html-webpack-plugin' )
const ExtractTextPlugin     = require( 'extract-text-webpack-plugin' )
const FaviconsWebpackPlugin = require( 'favicons-webpack-plugin' )

const extractText = new ExtractTextPlugin( { filename: 'static/sepal-[hash].css', allChunks: true } )

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
        extractText,
        new Webpack.ProvidePlugin( { "window.Tether": "tether" } ),
        new Webpack.ProvidePlugin( {
            $              : "jquery",
            jQuery         : "jquery",
            "window.jQuery": "jquery",
            "Tether"       : 'tether',
            // exports workaround for https://github.com/shakacode/bootstrap-loader/issues/172
            Alert          : "exports-loader?Alert!bootstrap/js/dist/alert",
            Button         : "exports-loader?Button!bootstrap/js/dist/button",
            Carousel       : "exports-loader?Carousel!bootstrap/js/dist/carousel",
            Collapse       : "exports-loader?Collapse!bootstrap/js/dist/collapse",
            Dropdown       : "exports-loader?Dropdown!bootstrap/js/dist/dropdown",
            Modal          : "exports-loader?Modal!bootstrap/js/dist/modal",
            Popover        : "exports-loader?Popover!bootstrap/js/dist/popover",
            Popper         : ['popper.js', 'default'],
            Scrollspy      : "exports-loader?Scrollspy!bootstrap/js/dist/scrollspy",
            Tab            : "exports-loader?Tab!bootstrap/js/dist/tab",
            Tooltip        : "exports-loader?Tooltip!bootstrap/js/dist/tooltip",
            Util           : "exports-loader?Util!bootstrap/js/dist/util"
        } ),
        new FaviconsWebpackPlugin( { logo: './src/icons/favicon.png', prefix: 'static/icons-[hash]/' } )
    ],
    resolve: { extensions: [ '.js' ] },
    devtool: 'source-map',
    module : {
        rules: [
            {
                test: /\.css$/,
                use : extractText.extract( {
                    fallback: 'style-loader',
                    use     : [
                        {
                            loader : 'css-loader',
                            options: {
                                importLoaders: 1
                            }
                        },
                        'postcss-loader'
                    ]
                } )
            },
            {
                test: /\.scss$/,
                use : extractText.extract( {
                    fallback: 'style-loader',
                    use     : [
                        {
                            loader : 'css-loader',
                            options: {
                                importLoaders: 1
                            }
                        },
                        'postcss-loader',
                        'sass-loader'
                    ]
                } )
            },
            {
                test: /\.woff2?(\?v=[0-9]\.[0-9]\.[0-9])?$/,
                // Limiting the size of the woff fonts breaks font-awesome ONLY for the extract text plugin
                // loader: "url?limit=10000"
                use : [ 'url-loader' ]
            },
            {
                test: /\.(ttf|eot|svg)(\?[\s\S]+)?$/,
                use : [ 'file-loader' ]
            },
            {
                test: /\.(png|jpg)$/,
                use : [ {
                    loader : 'url-loader',
                    options: {
                        limit: 8192,
                        name : '/static/[name].[ext]'
                    }
                } ]
            },
            {
                test: /bootstrap\/dist\/js\/umd\//,
                use : [ {
                    loader : 'imports',
                    options: {
                        jQuery: 'jquery'
                    }
                } ]
            },
            {
                test: /\.html$/,
                use : [ 'underscore-template-loader' ]
            }

        ]
    },
    node   : {
        fs: "empty"
    },

    devServer: {
        contentBase: './dist',
        host       : '0.0.0.0',
        proxy      : {
            // '/sandbox/geo-web-viz/**': { target: 'http://localhost:5678', secure: false, changeOrigin: true, pathRewrite: { '^/sandbox/geo-web-viz': '' } },
            '*'                      : { target: 'http://localhost:8001', secure: false, changeOrigin: true }
            // '*'                      : { target: 'http://localhost:9999' }
            // '*'                      : { target: 'https://test.sepal.io', secure: true, changeOrigin: true }
            // '*'                      : { target: 'https://sepal.io', secure: true, changeOrigin: true }
            // '*': { target: 'https://vagrant', secure: false } // Vagrant box
        }
    }
}