package manual

import org.openforis.sepal.sandbox.Sandbox
import org.openforis.sepal.sandbox.SandboxManager
import org.openforis.sepal.sandboxwebproxy.SandboxWebProxy

class SandboxWebProxySetup {
    public static void main(String[] args) {
        new SandboxWebProxy(8080, ['rstudio-server': 32772], new SandboxManager() {
            Sandbox obtain(String userName) {
                return new Sandbox(uri: '54.93.205.240')
            }

            def release(String userName) {
                return null
            }
        }).start()
    }
}
