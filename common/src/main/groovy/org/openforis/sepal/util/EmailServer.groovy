package org.openforis.sepal.util

import groovy.text.SimpleTemplateEngine
import org.openforis.sepal.util.annotation.ImmutableData

import javax.mail.Message
import javax.mail.Session
import javax.mail.internet.InternetAddress
import javax.mail.internet.MimeMessage

class EmailServer {
    private final String host
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
        def port = c.integer('port')
        username = c.string('username')
        password = c.string('password')
        props = System.getProperties()
        props["mail.smtp.starttls.enable"] = true
        props["mail.smtp.ssl.trust"] = host
        props["mail.smtp.auth"] = true
        props["mail.smtp.starttls.enable"] = true
        props["mail.smtp.starttls.required"] = false
        props["mail.smtp.host"] = host
        props["mail.smtp.port"] = port
    }

    void send(String to, EmailTemplate template) {
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
        } finally {
            transport.close()
        }
    }
}

@ImmutableData
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
