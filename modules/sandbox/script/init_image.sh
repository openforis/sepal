#!/bin/bash
set -e

apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -qq -y \
    gdebi-core \
    mapnik-utils \
    net-tools \
    openssh-server \
    sudo \
    supervisor \
    gettext \
    graphviz

# Disable message of the day by commenting out configuration lines refering to pam_motd.so
sed -e '/.*pam_motd\.so.*/ s/^#*/#/' -i /etc/pam.d/sshd
sed -e '/.*pam_motd\.so.*/ s/^#*/#/' -i /etc/pam.d/login
sed -e '/PrintMotd / s/^#*/#/' -i /etc/ssh/sshd_config
sed -e '/PrintLastLog / s/^#*/#/' -i /etc/ssh/sshd_config

# Prevent locale from being forwarded by client
sed -e '/AcceptEnv / s/^#*/#/' -i /etc/ssh/sshd_config

# Disable message of the day and last log printout, disable options for speeding up access.
# Authorized keys come from the per-user ~/.ssh/authorized_keys file (written from USER_PUBLIC_KEY at
# container init); the old sss_ssh_authorizedkeys AuthorizedKeysCommand was dead config (LDAP removed).
# Port 22 + 222: consumers (ssh-gateway, terminal) connect to port 222 — on AWS the host
# publishes 222→22, but local dev reaches the container directly via a network alias, so
# sshd must listen on 222 itself. Listing 22 too keeps the AWS mapping working unchanged.
printf '%s\n' \
    'Port 22' \
    'Port 222' \
    'PrintMotd no' \
    'PrintLastLog no' \
    'UseDNS no' \
    'GSSAPIAuthentication no' \
    >> /etc/ssh/sshd_config

# The prompt names the instance: the worker sets the container's hostname to the two-word name the
# user already reads everywhere else, so \h tells one open terminal from another. It used to be
# hardcoded to "sepal" because the hostname was the container id.
#
# It has to be set from PROMPT_COMMAND, not by assigning PS1 here: the user's home is persistent
# and holds the Debian skeleton ~/.bashrc, which is sourced after everything in /etc and sets its
# own PS1 — and, under TERM=xterm*, embeds an "\u@\h: \w" window title in it, which would overwrite
# the session name the ssh-gateway puts on the GUI's terminal tab. PROMPT_COMMAND runs after every
# rc file, just before the first prompt; it then removes itself, so a user who sets their own
# prompt afterwards keeps it.
#
# Colors follow the skeleton's own rule, so a terminal that never had a colored prompt still
# doesn't: green name, blue directory, on the same TERM test it used.
printf '%s\n' \
    'sepal_prompt() {' \
    '    case "$TERM" in' \
    "        xterm-color|*-256color) PS1='\[\033[01;32m\]\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\\\$ ';;" \
    "        *) PS1='\h:\w\\\$ ';;" \
    '    esac' \
    '    unset PROMPT_COMMAND' \
    '    unset -f sepal_prompt' \
    '}' \
    'PROMPT_COMMAND=sepal_prompt' \
    >> /etc/bash.bashrc