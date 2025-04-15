package org.openforis.sepal.component.user.adapter

import groovyx.net.http.RESTClient
import org.openforis.sepal.component.user.api.GoogleRecaptcha
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static groovyx.net.http.ContentType.JSON
import static groovyx.net.http.ContentType.URLENC

class RestGoogleRecaptcha implements GoogleRecaptcha {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final String googleProjectId
    private final String googleRecaptchaApiKey
    private final String googleRecaptchaSiteKey
    private final float googleRecaptchaMinScore
    private final String host

    RestGoogleRecaptcha(String googleProjectId, String googleRecaptchaApiKey, String googleRecaptchaSiteKey, float googleRecaptchaMinScore, String host) {
        this.googleProjectId = googleProjectId
        this.googleRecaptchaApiKey = googleRecaptchaApiKey
        this.googleRecaptchaSiteKey = googleRecaptchaSiteKey
        this.googleRecaptchaMinScore = googleRecaptchaMinScore
        this.host = host
    }

    private RESTClient getHttp() {
        new RESTClient('https://recaptchaenterprise.googleapis.com/v1/projects/' + googleProjectId + '/assessments')
    }

    boolean isValid(String recaptchaToken, String action) {
        try {
            def response = http.post(
                contentType: JSON,
                requestContentType: JSON,
                headers: ['Referer': host],
                query: [
                    key: googleRecaptchaApiKey,
                ],
                body: [
                    event: [
                        token: recaptchaToken,
                        expectedAction: action,
                        siteKey: googleRecaptchaSiteKey,
                    ]
                ]
            )
            def validAction = response.data &&            
                response.data.tokenProperties?.valid &&
                response.data.tokenProperties?.action == response.data?.event?.expectedAction
            def validScore = response.data?.riskAnalysis?.score >= googleRecaptchaMinScore
            if (validAction && !validScore) {
                LOG.warn('reCAPTCHA, too low score: ' + response.data.riskAnalysis)
            }
            return validAction && validScore
        } catch (Exception exception) {
            LOG.error('Could not validate reCAPTCHA', exception)
        }
    }
}
