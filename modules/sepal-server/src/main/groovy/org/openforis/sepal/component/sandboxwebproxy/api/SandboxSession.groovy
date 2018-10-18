package org.openforis.sepal.component.sandboxwebproxy.api

import groovy.transform.Immutable

@Immutable
class SandboxSession {
    String id
    String username
    String host
    boolean active
    boolean closed
}
