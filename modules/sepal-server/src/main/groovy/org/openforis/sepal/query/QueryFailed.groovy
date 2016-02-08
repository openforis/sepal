package org.openforis.sepal.query

class QueryFailed extends RuntimeException {
    private final QueryHandler handler
    private final Query query

    QueryFailed(QueryHandler handler, Query query, Exception cause) {
        super("Failed to execute $query using ${handler.class.name}", cause)
        this.query = query
        this.handler = handler
    }
}

