package org.openforis.sepal.component.sandboxwebproxy

import io.undertow.server.HttpServerExchange
import io.undertow.server.session.Session
import io.undertow.server.session.SessionListener


abstract class AbstractSessionListener implements SessionListener {
    void sessionCreated(Session session, HttpServerExchange exchange) {}

    void attributeAdded(Session session, String name, Object value) {}

    void attributeUpdated(Session session, String name, Object newValue, Object oldValue) {}

    void attributeRemoved(Session session, String name, Object oldValue) {}

    void sessionIdChanged(Session session, String oldSessionId) {}

    void sessionDestroyed(Session session, HttpServerExchange exchange, SessionListener.SessionDestroyedReason reason) {

    }
}
