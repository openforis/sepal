package org.openforis.sepal.component.sandboxmanager

import org.openforis.sepal.command.CommandDispatcher
import org.openforis.sepal.component.sandboxmanager.command.CheckBudget
import org.openforis.sepal.component.sandboxmanager.command.UpdateStorageUsage
import org.openforis.sepal.util.NamedThreadFactory
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService

import static java.util.concurrent.TimeUnit.MINUTES

class BudgetCheckScheduler {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final CommandDispatcher commandDispatcher
    private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor(
            NamedThreadFactory.singleThreadFactory(getClass().name)
    )

    BudgetCheckScheduler(CommandDispatcher commandDispatcher) {
        this.commandDispatcher = commandDispatcher
    }

    void start() {
        executor.scheduleWithFixedDelay({
            updateStorageUsage()
            checkBudget()
        }, 0, 1, MINUTES)
    }

    private void updateStorageUsage() {
        try {
            commandDispatcher.submit(new UpdateStorageUsage())
        } catch (Exception e) {
            LOG.error("Error updating storage usage", e)
        }
    }

    private void checkBudget() {
        try {
            commandDispatcher.submit(new CheckBudget())
        } catch (Exception e) {
            LOG.error("Error checking budget", e)
        }
    }

    void stop() {
        executor.shutdown()
    }
}
