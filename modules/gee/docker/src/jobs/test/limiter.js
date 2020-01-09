const {Limiter$} = require('../../limiter')

module.exports = Limiter$({
    name: 'Test',
    maxRate: 5,
    maxConcurrency: 5
})
