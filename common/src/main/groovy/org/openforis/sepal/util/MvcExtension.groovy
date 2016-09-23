package org.openforis.sepal.util

import groovy.json.JsonException
import groovy.json.JsonParserType
import groovy.json.JsonSlurper
import groovymvc.Controller
import groovymvc.Params
import org.openforis.sepal.endpoint.InvalidRequest

class MvcExtension {
    /**
     * Binds provided JSON object to bean and validates the bean.
     * <p>
     * An InvalidRequest is thrown if invalid JSON, JSON isn't an object, or there are binding and/or validation errors.
     * @param bean the bean to bind the JSON to
     * @param jsonObject the JSON String
     * @return the bean with the JSON bound.
     */
    static <T> T bindAndValidateJson(Controller self, T bean, String jsonObject) throws InvalidRequest {
        if (jsonObject == null || jsonObject.isEmpty())
            throw new InvalidRequest(['json': 'The request body must contain a JSON object'])
        self.requestContext.with {
            try {
                def map = new JsonSlurper().setType(JsonParserType.LAX).parseText(jsonObject)
                if (!(map instanceof Map))
                    throw new InvalidRequest('json': 'The request body must contain a JSON object')
                def params = new Params(map as Map)
                def errors = bindAndValidate(bean, params)
                if (errors)
                    throw new InvalidRequest(errors)
            } catch (JsonException e) {
                throw new InvalidRequest(['json': e.getMessage()])
            }
        }
        return bean
    }

    static void validateRequest(Controller self, Object bean) throws InvalidRequest {
        def errors = self.requestContext.validate(bean)
        if (errors)
            throw new InvalidRequest(errors)
    }

    /**
     * Reads and returns the request body. This method can only be called once per request.
     * @return the request body
     */
    static String getBody(Controller self) {
        self.requestContext.request.reader.text
    }
}
