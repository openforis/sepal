package org.openforis.sepal.component.user.api

import groovy.transform.Immutable
import org.openforis.sepal.user.User

@Immutable
class TokenStatus {
    public static final int MAX_AGE_DAYS = 7

    String token
    Date generationTime
    User user
    boolean expired

    boolean isValid() {
        user && !expired
    }
}
