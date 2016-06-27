package util

import fake.server.TestServer
import groovymvc.RequestContext
import org.openforis.sepal.taskexecutor.util.download.ExecutableDownload
import spock.lang.Specification

class ExecutableDownload_Test extends Specification {
    def file = File.createTempFile('downloaded', '.txt')

    def cleanup() {
        file.delete()
    }

    def 'Can download a file'() {
        when:
        def download = execute {
            send 'some data'
        }

        then:
        download.hasCompleted()
        file.text == 'some data'
    }

    def 'Fails when no content is returned'() {
        when:
        def download = execute {
            response.status = 204
        }

        then:
        download.hasFailed()
    }

    def 'Fails when status >= 400'() {
        when:
        def download = execute {
            response.status = 400
        }

        then:
        download.hasFailed()
    }

    def 'Tries to download a file three times before giving up'() {
        when:
        int tries = 0
        def download = execute {
            tries++
            halt(500)
        }

        then:
        download.hasFailed()
        tries == 3
    }

    def 'Can succeed after failing a couple of times'() {
        when:
        int tries = 0
        def download = execute {
            tries++
            if (tries < 3)
                halt(500)
            else
                send 'some data'
        }

        then:
        download.hasCompleted()
        tries == 3
    }

    private ExecutableDownload execute(@DelegatesTo(RequestContext) Closure action) {
        def testServer = new TestServer()
        testServer.get(action)
        testServer.start()
        def download = new ExecutableDownload(testServer.uri, file, System.getProperty('user.name'))
        download.tries = 3
        download.execute()
        return download
    }
}
