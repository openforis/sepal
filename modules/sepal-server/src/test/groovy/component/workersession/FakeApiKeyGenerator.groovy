package component.workersession

import org.openforis.sepal.component.workersession.api.ApiKeyGenerator

class FakeApiKeyGenerator implements ApiKeyGenerator {
    int counter = 0
    String prefix = 'test-api-key-'

    String generate() {
        "${prefix}${++counter}" as String
    }
}
