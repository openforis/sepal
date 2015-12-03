package manual

import org.openforis.sepal.sandboxwebproxy.SandboxWebProxy
import org.openforis.sepal.session.SepalSessionManager
import org.openforis.sepal.session.model.SepalSession
import org.openforis.sepal.session.model.UserSessions

class SandboxWebProxySetup {
    public static void main(String[] args) {
        new SandboxWebProxy(8080, ['rstudio-server': 32772], new SepalSessionManager() {
            SepalSession obtain(String userName) {
                return new SepalSession(containerURI: '54.93.205.240')
            }

            def release(String userName) {
                return null
            }

            @Override
            SepalSession bindToUserSession(String username, Long sessionId) {
                return null
            }

            @Override
            SepalSession generateNewSession(String username, Long containerInstanceType) {
                return null
            }

            @Override
            UserSessions getUserSessions(String username) {
                return null
            }

            @Override
            void aliveSignal(int sessionId) {

            }

            @Override
            void start(int containerInactiveTimeout, int checkInterval) {

            }

            @Override
            void stop() {

            }

        }).start()
    }
}
