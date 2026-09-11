// Mirrors the Java Username/Email validation: a format regex + a system-name blacklist, and the
// standard email pattern.
//
// The maximum lengths are contractual, not cosmetic: `username` and `email` are varchar(32) and
// varchar(255), and MySQL runs with STRICT_TRANS_TABLES, so an over-long value is a 500 rather
// than a silent truncation. EMAIL_MAX_LENGTH is the RFC 5321 maximum address length.
//
// Both validators are the same shape — type, then length, then format — so the format regexes
// describe only shape. Length first also bounds the work EMAIL_FORMAT can do: its
// `(X+(\.X+)*)` nests quantifiers, which is the classic catastrophic-backtracking form.
const USERNAME_MAX_LENGTH = 30
const EMAIL_MAX_LENGTH = 254

// A password is never compared in SQL, so its bounds are policy rather than a column width. They are
// the bounds the GUI's own form enforces.
const PASSWORD_MIN_LENGTH = 12
const PASSWORD_MAX_LENGTH = 100

const USERNAME_FORMAT = /^[a-zA-Z_][a-zA-Z0-9]*$/

const USERNAME_BLACKLIST = new Set([
    '_apt', 'backup', 'bin', 'daemon', 'games', 'gnats', 'irc', 'list', 'lp', 'mail', 'man',
    'messagebus', 'news', 'nobody', 'node', 'proxy', 'root', 'sshd', 'sssd', 'sync', 'sys',
    'systemd-network', 'systemd-resolve', 'systemd-timesync', 'uucp', 'www-data'
])

// eslint-disable-next-line no-useless-escape
const EMAIL_FORMAT = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/

// Credentials must be strings; SQL escaping does not prevent numeric coercion of text comparisons.
// `WHERE token = 0` matches every token that does not begin with a digit.
export const isText = value => typeof value === 'string'

const isValidUsername = username =>
    isText(username) &&
    username.length <= USERNAME_MAX_LENGTH &&
    USERNAME_FORMAT.test(username) &&
    !USERNAME_BLACKLIST.has(username)

const isValidEmail = email =>
    isText(email) &&
    email.length <= EMAIL_MAX_LENGTH &&
    EMAIL_FORMAT.test(email)

export const isValidPassword = password =>
    isText(password) &&
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH

export {EMAIL_MAX_LENGTH, isValidEmail, isValidUsername, USERNAME_MAX_LENGTH}
