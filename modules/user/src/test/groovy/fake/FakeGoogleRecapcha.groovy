package fake

import org.openforis.sepal.component.user.api.GoogleRecaptcha

class FakeGoogleRecaptcha implements GoogleRecaptcha {
    boolean valid = true

    boolean isValid(String token, String action) {
        return valid
    }
}
