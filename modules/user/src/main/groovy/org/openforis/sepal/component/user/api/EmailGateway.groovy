package org.openforis.sepal.component.user.api

import org.openforis.sepal.user.User

interface EmailGateway {
    void sendInvite(User user, String token)

    void sendMandatoryPasswordReset(User user, String token)
    
    void sendOptionalPasswordReset(User user, String token)
}

