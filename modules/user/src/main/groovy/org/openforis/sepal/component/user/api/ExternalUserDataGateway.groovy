package org.openforis.sepal.component.user.api

interface ExternalUserDataGateway {

    void createUser(String username)

    void changePassword(String username, String password)

    void deleteUser(String username)

}