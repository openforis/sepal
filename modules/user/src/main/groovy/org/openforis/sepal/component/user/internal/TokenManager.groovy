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
        def tokenStatus = userRepository.tokenStatus(token)
        if (!tokenStatus)
            return null
        def generationTime = tokenStatus.generationTime as Date
        def expired = canExpire && isExpired(tokenStatus)
        return new TokenStatus(
                token: token,
                generationTime: generationTime,
                user: tokenStatus.user as User,
                expired: expired
        )

    }

    private isExpired(tokenStatus) {
        return (tokenStatus.generationTime as Date) < clock.now() - MAX_AGE_DAYS
    }

    String getOrGenerateToken(String username) {
        def tokenStatus = userRepository.tokenStatusByUsername(username)
        return tokenStatus && !isExpired(tokenStatus) ? tokenStatus.token : UUID.randomUUID().toString()
    }

    void invalidate(String token) {
        userRepository.invalidateToken(token)
    }
}
