package org.openforis.sepal.component.user.api

import org.openforis.sepal.user.GoogleTokens
import org.openforis.sepal.user.User

interface UserRepository {
    User insertUser(User user, String token)

    void updateUserDetails(User user)

    void deleteUser(String username)

    List<User> listUsers()

    void setLastLoginTime(String username, Date loginTime)

    User lookupUser(String username)

    User findUserByUsername(String username)
    
    User findUserByEmail(String email)

    boolean emailNotificationsEnabled(String email)

    void updateToken(String username, String token, Date tokenGenerationTime)

    Map tokenStatus(String token)
    
    Map tokenStatusByUsername(String username)

    void invalidateToken(String token)

    void updateGoogleTokens(String username, GoogleTokens tokens)

    void updateStatus(String username, User.Status status)
}
