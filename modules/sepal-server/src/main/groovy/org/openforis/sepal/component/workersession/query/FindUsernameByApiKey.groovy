package org.openforis.sepal.component.workersession.query

import groovy.transform.Immutable
import org.openforis.sepal.component.workersession.api.WorkerSessionRepository
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler

@Immutable
class FindUsernameByApiKey implements Query<String> {
    String apiKey
}

class FindUsernameByApiKeyHandler implements QueryHandler<String, FindUsernameByApiKey> {
    private final WorkerSessionRepository sessionRepository

    FindUsernameByApiKeyHandler(WorkerSessionRepository sessionRepository) {
        this.sessionRepository = sessionRepository
    }

    String execute(FindUsernameByApiKey query) {
        return sessionRepository.findUsernameByApiKey(query.apiKey)
    }
}
