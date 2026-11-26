#!/bin/sh
set -e

# Jenkins uses the host's Docker socket, so it joins the group that owns it, whatever its name in the image. A
# restarted container keeps the groups of its earlier starts, so a group created here is named after its GID: a
# docker group left with an older GID can't block it.
DOCKER_GID=$(stat -c %g /var/run/docker.sock)
DOCKER_GROUP=$(getent group $DOCKER_GID | cut -d: -f1)
if [ -z "$DOCKER_GROUP" ]; then
    DOCKER_GROUP=docker-$DOCKER_GID
    addgroup -g $DOCKER_GID $DOCKER_GROUP
fi
id -nG jenkins | grep -qw $DOCKER_GROUP || addgroup jenkins $DOCKER_GROUP

# Setup GitHub SSH identity file
sudo -u jenkins rsync -a /var/lib/jenkins/.ssh/* /var/jenkins_home/.ssh/
SSH_DIR=/var/jenkins_home/.ssh
IDENTITY_FILE=$SSH_DIR/id_rsa
if ! test -f $IDENTITY_FILE; then
    sudo -u jenkins ssh-keygen -t rsa -b 4096 -C "GitHub key" -f $IDENTITY_FILE -N ""
    chmod 400 $IDENTITY_FILE
fi

# Setup jobs
sudo -u jenkins rsync -a /var/lib/jenkins/jobs/* /var/jenkins_home/jobs/

# Setup console sections. Not with JCasC: the plugin applies what JCasC sets only after another restart.
sudo -u jenkins rsync -a /var/lib/jenkins/org.jvnet.hudson.plugins.collapsingconsolesections.CollapsingSectionNote.xml \
    /var/jenkins_home/

if ! sudo --preserve-env --set-home --user jenkins python3 /usr/local/bin/registry_maintenance.py recover; then
    echo 'Registry recovery failed. Build launchers will retry it before doing any work.' >&2
fi

# Execute the parent image Entrypoint
exec sudo --preserve-env --set-home --user jenkins PATH=$PATH /sbin/tini -s -- /usr/local/bin/jenkins.sh
