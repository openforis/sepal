package org.openforis.sepal.sql

import groovy.sql.Sql
import org.openforis.sepal.transaction.TransactionManager
import org.openforis.sepal.util.lifecycle.Stoppable

import javax.sql.DataSource
import java.sql.Connection

class SqlConnectionManager implements SqlConnectionProvider, TransactionManager, Stoppable {
    final DataSource dataSource
    private final ThreadLocal<Connection> connectionHolder = new ThreadLocal<Connection>()
    private final ThreadLocal<List<Closure>> afterCommitCallbacksHolder = new ThreadLocal<List<Closure>>() {
        protected List<Closure> initialValue() { [] }
    }

    static SqlConnectionManager create(DatabaseConfig config) {
        new DatabaseMigration(config).migrate()
        return new SqlConnectionManager(config.createSchemaDataSource())
    }

    SqlConnectionManager(DataSource dataSource) {
        this.dataSource = dataSource
    }

    def <T> T withTransaction(Closure<T> closure) {
        def connection = null
        boolean newTransaction = !isTransactionRunning()
        def committed = false
        def result = null
        try {
            connection = openConnection()
            result = closure.call()
            if (newTransaction) {
                connection.commit()
                committed = true
            }
            return result
        } catch (Exception e) {
            if (connection?.isValid(10))
                connection?.rollback()
            releaseConnection(connection)
            throw e
        } finally {
            if (committed) {
                def listeners = afterCommitCallbacksHolder.get()
                releaseConnection(connection)
                listeners.each { it.call(result) }
            }
        }
    }

    private void releaseConnection(Connection connection) {
        connectionHolder.remove()
        afterCommitCallbacksHolder.remove()
        connection?.close()
    }

    void registerAfterCommitCallback(Closure callback) {
        afterCommitCallbacksHolder.get() << callback
    }

    boolean isTransactionRunning() {
        connectionHolder.get() != null
    }

    private Connection openConnection() {
        def connection = connectionHolder.get()
        if (connection) return connection
        connection = dataSource.connection
        connection.autoCommit = false
        connectionHolder.set(connection)
        return connection
    }

    Sql getSql() {
        def connection = connectionHolder.get()
        connection ? new Sql(connection) : new Sql(dataSource)
    }

    Connection getConnection() {
        connectionHolder.get() ?: dataSource.connection
    }

    void stop() {
        def connection = connectionHolder.get()
        if (connection) {
            connection.rollback()
            connection.close()
        }
    }
}
