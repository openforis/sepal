package org.openforis.sepal.component.sandboxwebproxy

import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.component.sandboxmanager.SandboxManagerComponent

class SandboxWebProxyComponent {
    private SandboxWebProxy sandboxWebProxy

    SandboxWebProxyComponent(SepalConfiguration config, SandboxManagerComponent sandboxManagerComponent) {
        sandboxWebProxy = new SandboxWebProxy(9191, ['rstudio-server': 8787], sandboxManagerComponent, 30, config.proxySessionTimeout)
    }

    SandboxWebProxyComponent start() {
        sandboxWebProxy.start()
        return this
    }

    void stop() {
        sandboxWebProxy.stop()
    }
}
