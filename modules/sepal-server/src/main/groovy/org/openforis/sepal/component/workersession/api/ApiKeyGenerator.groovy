package org.openforis.sepal.component.workersession.api

import java.security.SecureRandom

interface ApiKeyGenerator {
    String generate()
}

class SecureRandomApiKeyGenerator implements ApiKeyGenerator {
    private final SecureRandom random = new SecureRandom()
    private final Base64.Encoder encoder = Base64.urlEncoder.withoutPadding()

    String generate() {
        byte[] bytes = new byte[32]
        random.nextBytes(bytes)
        encoder.encodeToString(bytes)
    }
}
