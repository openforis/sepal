package org.openforis.sepal.component.user.internal

interface UserChangeListener {
    void changed(String username, Map user)

    void close()
}

