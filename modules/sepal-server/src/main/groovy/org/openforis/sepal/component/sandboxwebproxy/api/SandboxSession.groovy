package org.openforis.sepal.component.sandboxwebproxy.api

import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class SandboxSession {
    String id
    String username
    String host
    boolean active
}
