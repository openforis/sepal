package org.openforis.sepal.sshgateway

class SshSessionCommand {
    private final File privateKey
    private final File output

    SshSessionCommand(File privateKey, File output) {
        this.privateKey = privateKey
        this.output = output
    }

    void write(Map session) {
        output.executable = true
        output.write("#!/usr/bin/env bash\n" +
                "\$(alive.sh $session.id > ~/alive.log 2>&1 &) && ssh " +
                "-YC " +
                "-i $privateKey " +
                "-l $session.username " +
                "-q " +
                "-o StrictHostKeyChecking=no " +
                "-o UserKnownHostsFile=/dev/null " +
                "-p $session.port " +
                "$session.host \$1", 'UTF-8')
    }
}
