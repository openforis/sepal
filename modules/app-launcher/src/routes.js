const httpProxy = require('http-proxy')
const proxy = httpProxy.createProxyServer({target: 'http://seplan:8765', changeOrigin: true})

module.exports = router => {
    router
        .get('/helloworld', ctx => {
            // Existing code
            ctx.body = `Hola ${JSON.stringify(ctx.request.headers)}`
        })
        .all('/seplan/(.*)', async ctx => {
            ctx.respond = false // Bypass Koa's built-in response handling

            // Adjust the URL path
            ctx.req.url = ctx.req.url.replace(/^\/seplan/, '')

            // Proxy the request
            await new Promise((resolve, reject) => {
                proxy.web(ctx.req, ctx.res, err => {
                    if (err) {
                        reject(err)
                    } else {
                        resolve()
                    }
                })
            })
        })
}
