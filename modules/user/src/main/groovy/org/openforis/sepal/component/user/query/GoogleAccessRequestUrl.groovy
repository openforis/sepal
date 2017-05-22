package org.openforis.sepal.component.user.query

import org.openforis.sepal.component.user.adapter.GoogleOAuthClient
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler

class GoogleAccessRequestUrl implements Query<URI> {
    String destinationUrl
}

class GoogleAccessRequestUrlHandler implements QueryHandler<URI, GoogleAccessRequestUrl> {
    private final GoogleOAuthClient googleOAuthClient

    GoogleAccessRequestUrlHandler(GoogleOAuthClient googleOAuthClient) {
        this.googleOAuthClient = googleOAuthClient
    }

    URI execute(GoogleAccessRequestUrl query) {
        return googleOAuthClient.redirectUrl(query.destinationUrl)
    }
}
