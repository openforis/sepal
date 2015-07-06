package org.openforis.sepal.command

interface Command<R> {
    int getUserId()

    Date getTimestamp()

    void setTimestamp(Date timestamp)
}

abstract class AbstractCommand<R> implements Command<R> {
    int userId
    Date timestamp
}