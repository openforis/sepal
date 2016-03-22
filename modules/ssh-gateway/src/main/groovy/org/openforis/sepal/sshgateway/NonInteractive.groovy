package org.openforis.sepal.sshgateway

import org.slf4j.Logger
import org.slf4j.LoggerFactory

class NonInteractive {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final SepalClient sepalClient
    private final SshSessionCommand sessionCommand

    NonInteractive(String username, String sepalEndpoint, File privateKey, File output, String password) {
        sepalClient = new SepalClient(username, sepalEndpoint, password)
        sessionCommand = new SshSessionCommand(privateKey, output)
    }

    void start() {
        def sandboxInfo = sepalClient.loadSandboxInfo()
        BudgetChecker.assertWithinBudget(sandboxInfo)
        def sessions = sandboxInfo.sessions as List<Map>
        def activeSession = sessions.find { it.status == 'ACTIVE' }
        if (activeSession) {
            sepalClient.joinSession(activeSession)
            sessionCommand.write(activeSession)
            return
        }
        def startingSession = sessions.find { it.status == 'STARTING' }
        if (startingSession) {
            sepalClient.joinSession(activeSession)
            sessionCommand.write(activeSession)
            return
        }
        def instanceType = sandboxInfo.instanceTypes.first() as Map
        def session = sepalClient.createSession(instanceType)
        sessionCommand.write(session)
    }

    static void main(String[] args) {
        if (args.size() != 5)
            throw new IllegalArgumentException("Expects five arguments: username, sepal-server REST endpoint, " +
                    "private key path, output path, and sepalAdmin password")
        try {
            new NonInteractive(args[0], args[1], new File(args[2]), new File(args[3]), args[4]).start()
        } catch (Exception e) {
            LOG.error("NonInteractive failed", e)
            System.err.println("Something went wrong, please try again")
            System.exit(1)
        }
    }
}
