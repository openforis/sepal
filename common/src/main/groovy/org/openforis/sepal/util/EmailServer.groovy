package org.openforis.sepal.util

import groovy.text.SimpleTemplateEngine
import groovy.transform.Immutable
import org.slf4j.LoggerFactory

import javax.mail.Message
import javax.mail.Session
import javax.mail.internet.InternetAddress
import javax.mail.internet.MimeMessage

class EmailServer {
    private static final LOG = LoggerFactory.getLogger(this)
    private final String host
    private final int port
    private final String username
    private final String password
    private final String from
    private final Properties props

    EmailServer() {
        this(new Config('smtp.properties'))
    }

    EmailServer(Config c) {
        from = c.string('from')
        host = c.string('host')
        port = c.integer('port')
        username = c.string('username')
        password = c.string('password')
        props = System.getProperties()
        props["mail.smtp.starttls.enable"] = true
        props["mail.smtp.ssl.trust"] = host
        props["mail.smtp.auth"] = true
        props["mail.smtp.starttls.enable"] = true
        props["mail.smtp.starttls.required"] = false
        props["mail.smtp.host"] = host
        props["mail.smtp.port"] = this.port
    }

    void send(String to, EmailTemplate template) {
        LOG.debug("Sending email: [" +
                "host: ${host}, " +
                "port: ${port}, " +
                "username: ${username}, " +
                "from: ${from}, " +
                "to: ${to}, " +
                "subject: ${template.subject}, " +
                "binding: ${template.binding}" +
                "]")
        def session = Session.getDefaultInstance(props, null)
        def message = new MimeMessage(session)
        message.from = new InternetAddress(from)
        message.subject = template.subject
        message.setText(template.render(), 'UTF-8', 'html')
        message.addRecipient(Message.RecipientType.TO, new InternetAddress(to))
        def transport = session.getTransport("smtp")
        try {
            transport.connect(host, username, password)
            transport.sendMessage(message, message.allRecipients)
        } catch (Exception e) {
            throw new FailedToSend(to, template, e)
        } finally {
            transport.close()
        }
    }


    class FailedToSend extends RuntimeException {
        final String host
        final int port
        final String username
        final String from
        final String to
        final EmailTemplate template

        FailedToSend(String to, EmailTemplate template, Exception e) {
            super("Failed to send email: [" +
                    "host: ${EmailServer.this.host}, " +
                    "port: ${EmailServer.this.port}, " +
                    "username: ${EmailServer.this.username}, " +
                    "from: ${EmailServer.this.from}, " +
                    "to: ${to}, " +
                    "subject: ${template.subject}, " +
                    "binding: ${template.binding}" +
                    "]", e)
            this.host = EmailServer.this.host
            this.port = EmailServer.this.port
            this.username = EmailServer.this.username
            this.from = EmailServer.this.from
            this.to = to
            this.template = template
        }
    }
}


@Immutable
class EmailTemplate {
    Map<String, Object> binding
    String subject
    String preheader
    String body

    String render() {
        def body = renderTemplate(this.body, binding)
        return renderTemplate('/org/openforis/sepal/util/email-template.html', binding + [
                preheader: preheader,
                body     : body
        ])
    }

    private String renderTemplate(String name, Map<String, Object> binding) {
        def engine = new SimpleTemplateEngine()
        def templateText = getClass().getResourceAsStream(name).getText('UTF-8')
        def template = engine.createTemplate(templateText).make(new HashMap(binding + [subject: subject]))
        return template.toString()
    }
}
