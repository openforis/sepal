module.exports = {
    PORT: process.env.PORT || 3000,
    HOST: process.env.IP || '127.0.0.1',
    USERS_HOME: process.env.USERS_HOME || '/sepalUsers',
    SSH_SCRIPT_PATH: process.env.SSH_SCRIPT_PATH ||'ssh_gateway.sh'
}
