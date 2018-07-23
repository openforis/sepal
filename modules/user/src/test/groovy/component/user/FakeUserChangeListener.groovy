package component.user

import org.openforis.sepal.component.user.internal.UserChangeListener

class FakeUserChangeListener implements UserChangeListener {
    private final Map changes = [:]

    void changed(String username, Map user) {
        def userChanges = changes[username] ?: (changes[username] = [])
        userChanges << user
    }

    int changeCount(username) {
        return this.changes[username]?.size() ?: 0
    }

    Map lastChange(username) {
        def changes = this.changes[username]
        return changes?.last()
    }
}
