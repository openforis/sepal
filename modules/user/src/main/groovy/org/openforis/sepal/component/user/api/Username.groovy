package org.openforis.sepal.component.user.api

class Username {
    private static final BLACKLIST = [
        '_apt',
        'backup',
        'bin',
        'daemon',
        'games',
        'gnats',
        'irc',
        'list',
        'lp',
        'mail',
        'man',
        'messagebus',
        'news',
        'nobody',
        'node',
        'proxy',
        'root',
        'sshd',
        'sssd',
        'sync',
        'sys',
        'systemd-network',
        'systemd-resolve',
        'systemd-timesync',
        'uucp',
        'www-data'
    ]

    static boolean isValid(username) {
        return !(username in BLACKLIST)
    }
}
