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

    int getEmailCount() {
        server.emailCount
    }

    void stop() {
        server?.stop()
    }

    String getInvitationToken() {
        server.getMessage(0).body.find(/token=([\w-]*)/) { match, token -> token }
    }
}
