const proxy = require('http-proxy-middleware')

// eslint-disable-next-line no-undef
module.exports = app => app.use(proxy('/api', {target: 'http://localhost:8001/'}))
