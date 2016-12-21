package org.openforis.sepal.transaction

interface TransactionManager {
    public <T> T withTransaction(Closure<T> closure)

    void registerAfterCommitCallback(Closure callback)

    boolean isTransactionRunning()
}

class NullTransactionManager implements TransactionManager {
    def <T> T withTransaction(Closure<T> closure) {
        return closure.call()
    }

    void registerAfterCommitCallback(Closure callback) {

    }

    boolean isTransactionRunning() {
        return false
    }
}