package org.openforis.sepal.sql

import groovy.sql.Sql

interface SqlConnectionProvider {
    Sql getSql()
}
