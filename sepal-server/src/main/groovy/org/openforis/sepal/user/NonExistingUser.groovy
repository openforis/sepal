package org.openforis.sepal.user

final class NonExistingUser extends RuntimeException {
    NonExistingUser(String username) {
        super("User does not exist: $username")
    }
}
