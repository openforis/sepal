const log = require('sepal/log').getLogger('authenticate')

const {UsernamePasswordVerifier} = require('./usernanmePasswordVerifier')
const {UserRepository} = require('./userRepository')
const {Clock} = require('./clock')

const Authenticate = async ({username, password}) => {
    const usernamePasswordVerifier = UsernamePasswordVerifier()
    const userRepository = UserRepository()
    const clock = Clock()
    if (usernamePasswordVerifier.verify(username, password)) {
        userRepository.setLastLoginTime(username, clock.now()) 
        const user = await userRepository.lookupUser(username)
        return user
    } else {
        return null
    }
}

module.exports = {
    Authenticate
}
