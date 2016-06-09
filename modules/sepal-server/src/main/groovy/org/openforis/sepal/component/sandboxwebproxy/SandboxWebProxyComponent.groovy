package org.openforis.sepal.component.sandboxwebproxy

import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.component.hostingservice.HostingServiceAdapter
import org.openforis.sepal.component.sandboxwebproxy.adapter.WorkerSessionComponentAdapter
import org.openforis.sepal.component.workersession.WorkerSessionComponent
import org.openforis.sepal.util.lifecycle.Lifecycle

class SandboxWebProxyComponent implements Lifecycle {
    private SandboxWebProxy sandboxWebProxy

    SandboxWebProxyComponent(
            SepalConfiguration config,
            WorkerSessionComponent workerSessionComponent,
            HostingServiceAdapter hostingServiceAdapter) {
        sandboxWebProxy = new SandboxWebProxy(
                9191,
                config.portByProxiedEndpoint,
                new WorkerSessionComponentAdapter(hostingServiceAdapter.instanceTypes, workerSessionComponent),
                30,
                config.proxySessionTimeout)
    }

    void start() {
        sandboxWebProxy.start()
    }

    void stop() {
        sandboxWebProxy.stop()
    }
}
