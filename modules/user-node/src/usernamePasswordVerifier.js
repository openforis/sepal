const log = require('sepal/log').getLogger('usernamePasswordVerifier')

const UsernamePasswordVerifier = () => {
    return {
        verify: ({username, password}) => {
            return false // implement
        }
    }
}

module.exports = {
    UsernamePasswordVerifier
}
