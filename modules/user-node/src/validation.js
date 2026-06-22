// Mirrors the Java Username/Email validation: a format regex + a system-name blacklist, and the
// standard email pattern.
const USERNAME_FORMAT = /^[a-zA-Z_][a-zA-Z0-9]{0,29}$/

const USERNAME_BLACKLIST = new Set([
    '_apt', 'backup', 'bin', 'daemon', 'games', 'gnats', 'irc', 'list', 'lp', 'mail', 'man',
    'messagebus', 'news', 'nobody', 'node', 'proxy', 'root', 'sshd', 'sssd', 'sync', 'sys',
    'systemd-network', 'systemd-resolve', 'systemd-timesync', 'uucp', 'www-data'
])

// eslint-disable-next-line no-useless-escape
const EMAIL_FORMAT = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/

const isValidUsername = username =>
    typeof username === 'string' &&
    USERNAME_FORMAT.test(username) &&
    !USERNAME_BLACKLIST.has(username)

const isValidEmail = email =>
    typeof email === 'string' && EMAIL_FORMAT.test(email)

export {isValidEmail, isValidUsername}
