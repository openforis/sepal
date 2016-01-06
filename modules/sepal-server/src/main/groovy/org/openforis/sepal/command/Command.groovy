package org.openforis.sepal.command

interface Command<R> {


    Date getTimestamp()

    void setTimestamp(Date timestamp)

    String getUsername()
}

abstract class AbstractCommand<R> implements Command<R> {
    Date timestamp
    String username
}