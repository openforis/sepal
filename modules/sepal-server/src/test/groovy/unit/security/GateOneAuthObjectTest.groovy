package unit.security

import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import org.openforis.sepal.security.GateOneAuthObject
import spock.lang.Specification

import static groovy.json.JsonOutput.prettyPrint

class GateOneAuthObjectTest extends Specification {
    def 'Auth object is valid'() {
        def timestamp = 1234567890123L
        println timestamp

        when:
        def json = new GateOneAuthObject(
                publicKey: 'somePublicKey',
                privateKey: 'somePrivateKey',
                username: 'someUsername',
                timestamp: timestamp
        ).toJson()

        then:

        sameJson(json, [
                authObject:
                        [
                                api_key         : 'somePublicKey',
                                upn             : 'someUsername',
                                timestamp       : timestamp,
                                signature_method: 'HMAC-SHA1',
                                api_version     : '1.0',
                                signature       : 'c2e1ff8a4a68f3c4e227a4906c7fc4081262bd58'
                        ]
        ])
    }

    final void sameJson(String result, expectation) {
        def expectationString = prettyPrint(JsonOutput.toJson(recursiveSort(expectation)))
        def resultString = prettyPrint(JsonOutput.toJson(recursiveSort(new JsonSlurper().parseText(result))))
        assert resultString == expectationString
    }

    final <T> T recursiveSort(T t) {
        if (t instanceof Map)
            t = t.each {
                t[it.key] = recursiveSort(it.value)
            }.sort()
        else if (t instanceof List)
            t.eachWithIndex { item, i ->
                t.set(i, recursiveSort(item))
            }
        return t
    }
}
