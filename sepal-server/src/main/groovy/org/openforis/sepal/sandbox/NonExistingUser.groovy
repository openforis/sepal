package org.openforis.sepal.sandbox

final class NonExistingUser extends RuntimeException {
    NonExistingUser(String username) {
        super("User does not exist: $username")
    }
}
