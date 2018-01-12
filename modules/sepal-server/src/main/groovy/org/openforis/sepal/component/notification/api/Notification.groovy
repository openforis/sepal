package org.openforis.sepal.component.notification.api

import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class Notification {
    Message message
    String username
    State state

    enum State {
        UNREAD, READ
    }

}
