package manual

import org.openforis.sepal.sandbox.SandboxData
import org.openforis.sepal.sandbox.SandboxManager
import org.openforis.sepal.sandbox.Size
import org.openforis.sepal.sandboxwebproxy.SandboxWebProxy

class SandboxWebProxySetup {
    public static void main(String[] args) {
        new SandboxWebProxy(8080, ['rstudio-server': 32772], new SandboxManager() {
            SandboxData obtain(String userName) {
                return new SandboxData(uri: '54.93.205.240')
            }

            def release(String userName) {
                return null
            }

            @Override
            SandboxData getUserSandbox(String username) {
                return null
            }

            @Override
            SandboxData getUserSandbox(String username, Size sandboxSize) {
                return null
            }


            @Override
            void aliveSignal(int sandboxId) {

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
