package org.openforis.sepal.util

import groovy.json.JsonException
import groovy.json.JsonParserType
import groovy.json.JsonSlurper
import groovymvc.Controller
import groovymvc.Params
import org.openforis.sepal.endpoint.InvalidRequest
import org.openforis.sepal.endpoint.MalformedRequest
import org.openforis.sepal.user.User

import static groovy.json.JsonParserType.LAX

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


    /**
     * Reads, parses, and returns the request body as a JSON Object. This method can only be called once per request.
     * @return the request body as a JSON Object
     */
    static <T> T jsonBody(Controller self, Class<T> expectedType = Object) {
        def body = getBody(self)
        T result = null
        if (body) {
            try {
                result = new JsonSlurper(type: LAX).parseText(body)
            } catch (Exception e) {
                throw new MalformedRequest('Request body is not well-formed JSON.', e)
            }
            if (!expectedType.isAssignableFrom(result.getClass()))
                throw new MalformedRequest("Request body expected to be of type ${expectedType.simpleName}.")

        }
        return result
    }

    static User getSepalUser(Controller self) throws InvalidRequest {
        self.requestContext.currentUser as User
    }
}
