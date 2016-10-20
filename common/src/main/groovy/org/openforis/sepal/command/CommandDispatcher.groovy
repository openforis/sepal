package org.openforis.sepal.command

import org.openforis.sepal.transaction.TransactionManager
import org.openforis.sepal.util.Is
import org.slf4j.Logger
import org.slf4j.LoggerFactory

interface CommandDispatcher {
    public <R> R submit(Command<R> command)
}

class HandlerRegistryCommandDispatcher implements CommandDispatcher {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final TransactionManager transactionManager
    private final Map<Class<? extends Command>, CommandHandler> handlers = [:]

    HandlerRegistryCommandDispatcher(TransactionManager transactionManager) {
        this.transactionManager = transactionManager
    }

    public <R, C extends Command<R>> HandlerRegistryCommandDispatcher register(Class<C> commandType, CommandHandler<R, C> handler) {
        handlers[commandType] = handler
        return this
    }

    @SuppressWarnings("GroovyAssignabilityCheck")
    def <R> R submit(Command<R> command) {
        Is.notNull(command, 'Command is null')
        def handler = handlers[command.class]
        if (handler == null)
            throw new IllegalStateException("No handler registered for commands of type ${command.class.name}")
        LOG.debug("Executing command $command with handler $handler")
        try {
            if (handler instanceof AfterCommitCommandHandler)
                transactionManager.registerAfterCommitCallback {result ->
                    transactionManager.withTransaction {
                        ((AfterCommitCommandHandler) handler).afterCommit(command, result)
                    }
                }
            transactionManager.withTransaction {
                handler.execute(command)
            }
        } catch (Exception e) {
            def executionFailed = new ExecutionFailed(handler, command, e)
            LOG.error(executionFailed.message, e)
            throw executionFailed
        }
    }
}
