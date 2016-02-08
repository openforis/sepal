package org.openforis.sepal.component.sandboxmanager

import groovy.time.TimeCategory
import groovy.transform.ToString
import org.openforis.sepal.command.CommandDispatcher
import org.openforis.sepal.component.sandboxmanager.command.CloseTimedOutSessions
import org.openforis.sepal.component.sandboxmanager.command.TerminateRedundantInstances
import org.openforis.sepal.util.NamedThreadFactory
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService

import static java.util.concurrent.TimeUnit.SECONDS

@ToString
class SandboxCleanup {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final CommandDispatcher commandDispatcher
    private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor(
            NamedThreadFactory.singleThreadFactory(getClass().name)
    )

    SandboxCleanup(CommandDispatcher commandDispatcher) {
        this.commandDispatcher = commandDispatcher
    }

    void start() {
        executor.scheduleWithFixedDelay({
            closeTimedOutSessions()
            terminateRedundantInstances()
        }, 0, 10, SECONDS)
    }

    void stop() {
        executor.shutdown()
    }

    private void closeTimedOutSessions() {
        try {
            commandDispatcher.submit(new CloseTimedOutSessions(updatedBefore: updatedBefore()))
        } catch (Exception e) {
            LOG.error("Error when closing timed-out sessions", e)
        }
    }

    private void terminateRedundantInstances() {
        try {
            commandDispatcher.submit(new TerminateRedundantInstances())
        } catch (Exception e) {
            LOG.error("Error terminating redundant instances", e)
        }
    }

    private Date updatedBefore() {
        use(TimeCategory) {
            new Date() - 1.minute
        }
    }

}
