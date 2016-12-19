package org.openforis.sepal.undertow;

import io.undertow.UndertowLogger;
import io.undertow.server.ConduitWrapper;
import io.undertow.server.HttpServerExchange;
import io.undertow.server.handlers.encoding.ContentEncodingProvider;
import io.undertow.util.ConduitFactory;
import org.xnio.conduits.StreamSinkConduit;

/**
 * Content coding for 'deflate'
 *
 * @author Stuart Douglas
 */
public class PatchedGzipEncodingProvider implements ContentEncodingProvider {

    @Override
    public ConduitWrapper<StreamSinkConduit> getResponseWrapper() {
        return new ConduitWrapper<StreamSinkConduit>() {
            @Override
            public StreamSinkConduit wrap(final ConduitFactory<StreamSinkConduit> factory, final HttpServerExchange exchange) {
                UndertowLogger.REQUEST_LOGGER.tracef("Created GZIP response conduit for %s", exchange);
                return new PatchedGzipStreamSinkConduit(factory, exchange);
            }
        };
    }
}
