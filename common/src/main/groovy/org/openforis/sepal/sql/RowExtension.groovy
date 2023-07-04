package org.openforis.sepal.sql

import groovy.sql.GroovyResultSet
import groovy.sql.GroovyRowResult
import org.openforis.sepal.endpoint.InvalidRequest

import java.sql.Clob

class RowExtension {
    static String longText(GroovyResultSet self, String column) throws InvalidRequest {
        return self[column] instanceof Clob
                ? ((Clob) self[column]).characterStream.text
                : self[column]
    }

    static String longText(GroovyRowResult self, String column) throws InvalidRequest {
        return self[column] instanceof Clob
                ? ((Clob) self[column]).characterStream.text
                : self[column]
    }
}
