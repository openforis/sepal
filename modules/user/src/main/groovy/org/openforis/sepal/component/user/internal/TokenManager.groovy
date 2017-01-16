package org.openforis.sepal.component.user.internal

import org.openforis.sepal.component.user.api.TokenStatus
import org.openforis.sepal.component.user.api.UserRepository
import org.openforis.sepal.user.User
import org.openforis.sepal.util.Clock

import static org.openforis.sepal.component.user.api.TokenStatus.MAX_AGE_DAYS

class TokenManager {
    private final UserRepository userRepository
    private final Clock clock

    TokenManager(UserRepository userRepository, Clock clock) {
        this.userRepository = userRepository
        this.clock = clock
    }

    TokenStatus validate(String token, boolean canExpire = true) {
        def map = userRepository.tokenStatus(token)
        if (!map)
            return null
        def generationTime = map.generationTime as Date
        def expired = canExpire && generationTime < clock.now() - MAX_AGE_DAYS
        return new TokenStatus(
                token: token,
                generationTime: generationTime,
                user: map.user as User,
                expired: expired
        )

    }

    void invalidate(String token) {
        userRepository.invalidateToken(token)
    }
}
