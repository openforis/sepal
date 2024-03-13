/* craco.config.js */
const path = require('path')

const alias = {
    '~': path.resolve(__dirname, 'src/'),
}

module.exports = {
    webpack: {
        alias
    },
    resolve: {
        alias
    }
}
