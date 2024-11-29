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

    RestGoogleRecaptcha(String googleProjectId, String googleRecaptchaApiKey, String googleRecaptchaSiteKey) {
        this.googleProjectId = googleProjectId
        this.googleRecaptchaApiKey = googleRecaptchaApiKey
        this.googleRecaptchaSiteKey = googleRecaptchaSiteKey
    }

    private RESTClient getHttp() {
        new RESTClient('https://recaptchaenterprise.googleapis.com/v1/projects/' + googleProjectId + '/assessments')
    }

    boolean isValid(String recaptchaToken, String action) {
        try {
            def response = http.post(
                contentType: JSON,
                requestContentType: JSON,
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
            response.data &&            
                response.data.tokenProperties?.valid &&
                response.data.tokenProperties?.action == response.data?.event?.expectedAction &&
                response.data.riskAnalysis?.score > 0.7
        } catch (Exception exception) {
            LOG.info('Could not validate reCAPTCHA', exception)
        }
    }
}
