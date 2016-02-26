package fake

import org.openforis.sepal.user.User
import org.openforis.sepal.user.UserRepository

class FakeUserRepository implements UserRepository {
    private boolean containsUser = true

    User fetchUser(String username) { throw new UnsupportedOperationException('Not implemented in fake') }

    User getUser(String username) { throw new UnsupportedOperationException('Not implemented in fake') }

    boolean contains(String username) {
        return containsUser
    }

    void doesNotContainUser() {
        containsUser = false;
    }

    void eachUsername(Closure closure) {

    }
}
