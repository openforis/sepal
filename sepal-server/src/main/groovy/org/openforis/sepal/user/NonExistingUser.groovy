package org.openforis.sepal.user

final class NonExistingUser extends RuntimeException {

    def username

    NonExistingUser(String username) {
        super("User does not exist: $username")
        this.username = username
    }
}
