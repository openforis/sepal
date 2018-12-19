package org.openforis.sepal.component.user.adapter

import org.openforis.sepal.component.user.api.EmailGateway
import org.openforis.sepal.user.User
import org.openforis.sepal.util.EmailServer
import org.openforis.sepal.util.EmailTemplate

class SmtpEmailGateway implements EmailGateway {
    private final EmailServer server
    private final String sepalHost

    SmtpEmailGateway(String sepalHost, EmailServer server) {
        this.sepalHost = sepalHost
        this.server = server
    }

    void sendInvite(User user, String token) {
        String to = user.email
        def template = new EmailTemplate(
                subject: 'Sepal Account',
                preheader: 'An account on Sepal has been created for you.',
                body: '/org/openforis/sepal/component/user/adapter/email-invitation.html',
                binding: [
                        user          : user,
                        activationLink: "https://$sepalHost/setup-account?token=$token"
                ]
        )
        server.send(to, template)
    }

    void sendPasswordReset(User user, String token) {
        String to = user.email
        def template = new EmailTemplate(
                subject: 'Sepal Password Reset',
                preheader: 'A request to reset your Sepal password have been made.',
                body: '/org/openforis/sepal/component/user/adapter/email-password-reset.html',
                binding: [
                        user          : user,
                        passwordResetLink: "https://$sepalHost/reset-password?token=$token"
                ]
        )
        server.send(to, template)
    }
}