package fake

import groovymvc.security.UsernamePasswordVerifier

class FakeUsernamePasswordVerifier implements UsernamePasswordVerifier {
    private boolean valid = true

    boolean verify(String username, String password) {
        return valid
    }

    void valid() {
        valid = true
    }

    void invalid() {
        valid = false
    }
}

