package org.openforis.sepal.component.sandboxwebproxy

import io.undertow.server.HttpServerExchange
import io.undertow.server.session.Session
import io.undertow.server.session.SessionListener


abstract class SessionDestroyedListener implements SessionListener {
    final void sessionCreated(Session session, HttpServerExchange exchange) {}

    final void attributeAdded(Session session, String name, Object value) {}

    final void attributeUpdated(Session session, String name, Object newValue, Object oldValue) {}

    final void attributeRemoved(Session session, String name, Object oldValue) {}

    final void sessionIdChanged(Session session, String oldSessionId) {}
}
