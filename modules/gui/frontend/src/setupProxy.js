const { createProxyMiddleware } = require('http-proxy-middleware')

// eslint-disable-next-line no-undef
module.exports = app => app
    .use(createProxyMiddleware('/api', {target: 'http://localhost:8001/', ws: true}))
    .use(createProxyMiddleware('/ceo', {target: 'http://localhost:8001/', ws: true}))
