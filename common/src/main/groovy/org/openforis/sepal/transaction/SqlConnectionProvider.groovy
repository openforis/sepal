package org.openforis.sepal.transaction

import groovy.sql.Sql

interface SqlConnectionProvider {
    Sql getSql()
}
