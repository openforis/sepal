package org.openforis.sepal.sql

import groovy.sql.GroovyResultSet
import org.openforis.sepal.endpoint.InvalidRequest

import java.sql.Clob
import java.sql.NClob

class RowExtension {
    static String longText(GroovyResultSet self, String column) throws InvalidRequest {
        return self[column] instanceof Clob ? ((Clob) self[column]).asciiStream.text : self[column]
    }
}
