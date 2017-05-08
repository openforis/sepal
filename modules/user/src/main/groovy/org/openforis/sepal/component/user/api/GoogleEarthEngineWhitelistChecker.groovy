package org.openforis.sepal.component.user.api

import org.openforis.sepal.user.GoogleTokens

interface GoogleEarthEngineWhitelistChecker {
    boolean isWhitelisted(String username, GoogleTokens tokens)
}