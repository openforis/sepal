package fake

import com.dumbster.smtp.ServerOptions
import com.dumbster.smtp.SmtpServer
import com.dumbster.smtp.SmtpServerFactory
import util.Port

class FakeMailServer {
    final int port = Port.findFree()
    private final SmtpServer server

    FakeMailServer() {
        server = SmtpServerFactory.startServer(new ServerOptions(
                port: port,
                threaded: false
        ))
    }

    void clear() {
        server.clearMessages()
    }

    int getEmailCount() {
        server.emailCount
    }

    void stop() {
        server?.stop()
    }

    String getToken() {
        if (server.emailCount == 0)
            throw new IllegalStateException("No emails received")
        def body = server.getMessage(server.emailCount - 1).body
        def token = body.find(/token=([\w-]*)/) { match, token -> token }
        if (!token)
            throw new IllegalStateException("Token not found in email:\n$body")
        return token
    }

}
