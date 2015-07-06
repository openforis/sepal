package org.openforis.sepal.transaction

interface TransactionManager {
    public <T> T withTransaction(Closure<T> closure)

    void registerAfterCommitCallback(Closure callback)

    boolean isTransactionRunning()
}
