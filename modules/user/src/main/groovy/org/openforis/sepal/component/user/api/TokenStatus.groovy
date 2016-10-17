package org.openforis.sepal.component.user.api

import org.openforis.sepal.user.User
import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
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
