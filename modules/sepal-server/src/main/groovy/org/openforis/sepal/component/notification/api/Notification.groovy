package org.openforis.sepal.component.notification.api

import groovy.transform.Immutable

@Immutable
class Notification {
    Message message
    String username
    State state

    enum State {
        UNREAD, READ
    }

}
