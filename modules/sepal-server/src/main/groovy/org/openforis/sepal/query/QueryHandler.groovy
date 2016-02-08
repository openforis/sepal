package org.openforis.sepal.query

interface QueryHandler<R, Q extends Query<R>> {
    R execute(Q query)
}
