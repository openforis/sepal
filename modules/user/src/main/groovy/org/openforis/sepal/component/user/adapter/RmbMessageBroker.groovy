package org.openforis.sepal.component.user.adapter

import org.openforis.rmb.MessageHandler
import org.openforis.rmb.RepositoryMessageBroker
import org.openforis.rmb.jdbc.JdbcConnectionManager
import org.openforis.rmb.jdbc.JdbcMessageRepository
import org.openforis.rmb.slf4j.Slf4jLoggingMonitor
import org.openforis.rmb.spi.TransactionSynchronizer
import org.openforis.rmb.xstream.XStreamMessageSerializer
import org.openforis.sepal.messagebroker.MessageBroker
import org.openforis.sepal.messagebroker.MessageConsumer
import org.openforis.sepal.messagebroker.MessageQueue
import org.openforis.sepal.sql.SqlConnectionManager
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.sql.Connection
import java.sql.SQLException

import static java.util.concurrent.TimeUnit.MINUTES
import static org.openforis.rmb.spi.ThrottlingStrategy.ExponentialBackoff.upTo

class RmbMessageBroker implements MessageBroker {
    private static Logger LOG = LoggerFactory.getLogger(RmbMessageBroker)
    private org.openforis.rmb.MessageBroker messageBroker

    RmbMessageBroker(SqlConnectionManager connectionManager) {
        this.messageBroker = RepositoryMessageBroker.builder(
                new JdbcMessageRepository(new RmbConnectionManager(connectionManager), "rmb_"),
                new RmbTransactionSynchronizer(connectionManager))
                .messageSerializer(new XStreamMessageSerializer())
                .monitor(new Slf4jLoggingMonitor())
                .build()

    }

    void start() {
        messageBroker.start()
    }

    void stop() {
        messageBroker?.stop()
    }

    def <M> MessageQueue<M> createMessageQueue(String queueName, Class<M> messageType, Closure consumer) {
        def queue = this.messageBroker.queueBuilder(queueName, messageType)
                .consumer(org.openforis.rmb.MessageConsumer.builder("$queueName consumer", {
                    try {
                        return consumer.call(it)
                    } catch (Exception e) {
                        LOG.error("[$queueName] Failed to handle message: $it", e)
                        throw (e instanceof RuntimeException ? e : new RuntimeException(e))
                    }
                } as MessageHandler<M>).retryUntilSuccess(upTo(1, MINUTES))
                ).build()
        return new RmbMessageQueue<M>(queue)
    }

    static class RmbTransactionSynchronizer implements TransactionSynchronizer {
        private final SqlConnectionManager connectionManager

        RmbTransactionSynchronizer(SqlConnectionManager connectionManager) {
            this.connectionManager = connectionManager
        }

        boolean isInTransaction() {
            connectionManager.transactionRunning
        }

        void notifyOnCommit(TransactionSynchronizer.CommitListener listener) {
            connectionManager.registerAfterCommitCallback {
                listener.committed()
            }
        }
    }

    static class RmbConnectionManager implements JdbcConnectionManager {
        private final SqlConnectionManager connectionManager

        RmbConnectionManager(SqlConnectionManager connectionManager) {
            this.connectionManager = connectionManager
        }

        Connection getConnection() throws SQLException {
            return connectionManager.connection
        }

        void releaseConnection(Connection connection) {
            if (!connectionManager.transactionRunning)
                connection.close()
        }
    }

}