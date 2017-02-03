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
        LOG.debug("Executing command $command")
        try {
            if (handler instanceof AfterCommitCommandHandler)
                transactionManager.registerAfterCommitCallback { result ->
                    LOG.debug("Executing after commit callback for command $command")
                    def (ignore, duration) = time {
                        transactionManager.withTransaction {
                            ((AfterCommitCommandHandler) handler).afterCommit(command, result)
                        }
                    }
                    LOG.debug("Completed after commit callback for command $command after $duration millis")
                }
            def (result, duration) = time {
                transactionManager.withTransaction {
                    handler.execute(command)
                }
            }
            LOG.debug("Completed command $command after $duration millis")
            return result
        } catch (Exception e) {
            def executionFailed = new ExecutionFailed(handler, command, e)
            LOG.error(executionFailed.message, e)
            throw executionFailed
        }
    }

    private List time(Closure callback) {
        def start = System.currentTimeMillis()
        def result = callback.call()
        return [result, System.currentTimeMillis() - start]
    }
}
