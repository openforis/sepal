module.exports = {
    devServer: function (configFunction, env) {
        return function (proxy, allowedHost) {
            const config = configFunction(proxy, allowedHost)
            if (env === 'development') {
                const defaultProxy = config.proxy[0]
                const contentSecurityPolicy = 'connect-src \'self\' wss://localhost:3000 https://*.googleapis.com https://apis.google.com; ' +
                    'frame-ancestors \'self\''
                Object.assign(defaultProxy, {
                    changeOrigin: true,
                    autoRewrite: true,
                    ws: true,
                    onProxyRes: proxyRes => proxyRes.headers['Content-Security-Policy'] = contentSecurityPolicy
                })
                config.proxy.unshift({
                    ...defaultProxy,
                    context: ['/api'],
                })
                config.headers = {
                    ...config.headers,
                    'Content-Security-Policy': contentSecurityPolicy
                }
            }
            return config
        }
    },
    webpack: function override(config, env) {
        // verifyAllKeysTranslated(['en', 'es'])

        configureCssModuleLoader(config.module.rules)
        return config

        function configureImportsLoaders(importsLoaders) {
            Object.keys(importsLoaders).forEach(path =>
                config.module.rules = (config.module.rules || []).concat({
                    test: require.resolve(path),
                    enforce: 'pre',
                    use: 'imports-loader?' + importsLoaders[path]
                })
            )
        }

        /**
         * Find the /\.css$/ matching rule with a css-loader.
         * Exclude /\.module\.css$/.
         * Clone it to match /\.module\.css$/, and enable module support.
         */
        function configureCssModuleLoader(o) {
            if (o instanceof Array)
                return o.find((item, i) => {
                    if (item instanceof Object && 'test' in item && String(item.test) === '/\\.css$/') {
                        const cssLoader = findCssLoader(item)
                        if (cssLoader) {
                            const loaders = o
                            const globalCssConfig = item
                            const moduleCssConfig = JSON.parse(JSON.stringify(globalCssConfig))

                            globalCssConfig.exclude = /\.module\.css$/
                            moduleCssConfig.test = /\.module\.css$/
                            loaders.splice(i, 0, moduleCssConfig)

                            const cssModuleLoader = findCssLoader(moduleCssConfig)
                            cssModuleLoader.options.modules = true
                            cssModuleLoader.options.localIdentName = '[name]__[local]___[hash:base64:5]'
                            return globalCssConfig
                        } else
                            return null
                    } else
                        configureCssModuleLoader(item)
                })
            else if (o instanceof Object)
                return Object.keys(o).find(key => configureCssModuleLoader(o[key]))
            else
                return null
        }

        function findCssLoader(o) {
            if (o instanceof Array) {
                return o
                    .map(item => findCssLoader(item))
                    .filter(item => item)
                    .find(item => item)
            } else if (o instanceof Object) {
                if ('loader' in o && o.loader.indexOf('/css-loader/') > -1)
                    return o
                else
                    return Object.keys(o).map(key => findCssLoader(o[key]))
                        .filter(item => item)
                        .find(item => item)
            } else
                return null
        }

        function verifyAllKeysTranslated(locales) {
            const _ = require('lodash')
            const flat = require('flat')

            function getLocalesInDirectory(directory) {
                const fs = require('fs')
                return fs.readdirSync(directory).filter(name => /^[^\\.]/.test(name))
            }

            const incompleteKeys = _.chain(locales || getLocalesInDirectory('src/locale'))
                .map(locale => require(`./src/locale/${locale}/translations`))
                .map(messages =>
                    _.chain(flat.flatten(messages))
                        .pickBy(_.identity)
                        .keys()
                        .value())
                .thru(keys => _.difference(_.union(...keys), _.intersection(...keys)))
                .value()

            if (incompleteKeys.length)
                throw new Error(`Missing translations: \n\t${incompleteKeys.join('\n\t')}\n\n`)
        }
    }
}
