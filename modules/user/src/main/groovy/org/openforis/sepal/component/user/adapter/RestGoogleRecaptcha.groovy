package org.openforis.sepal.component.user.adapter

import groovyx.net.http.RESTClient
import org.openforis.sepal.component.user.api.GoogleRecaptcha
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static groovyx.net.http.ContentType.JSON
import static groovyx.net.http.ContentType.URLENC

class RestGoogleRecaptcha implements GoogleRecaptcha {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final String googleRecaptchaSecretKey

    RestGoogleRecaptcha(String googleRecaptchaSecretKey) {
        this.googleRecaptchaSecretKey = googleRecaptchaSecretKey
    }

    private RESTClient getHttp() {
        new RESTClient('https://www.google.com/recaptcha/api/siteverify')
    }

    boolean isValid(String recaptchaToken, String action) {
        try {
            def response = http.post(
                contentType: JSON,
                requestContentType: URLENC,
                body: [
                    secret: googleRecaptchaSecretKey,
                    response: recaptchaToken
                ]
            )
            response?.data?.success && (!action || response?.data?.action == action)
        } catch (Exception exception) {
            LOG.info('Could not validate reCAPTCHA', exception)
        }
    }
}
