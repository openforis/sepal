package component.workerinstance

import org.openforis.sepal.component.workerinstance.WorkerInstanceConfig
import spock.lang.Specification
import spock.lang.Unroll

class WorkerInstanceTest extends Specification {
    @SuppressWarnings("GroovyPointlessBoolean")
    @Unroll
    def 'isOlderVersion(#v1, #v2) == #isOlder'() {
        expect:
        WorkerInstanceConfig.isOlderVersion(v1, v2) == isOlder

        where:
        v1   | v2   || isOlder
        '1'  | '2'  || true
        '1'  | '1'  || false
        '2'  | '1'  || false
        '2'  | '10' || true
        '1b' | '2a' || true
        '1a' | '1b' || false
        '2a' | '1b' || false
    }
}
