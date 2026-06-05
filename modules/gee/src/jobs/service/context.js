import {createRequire} from 'module'
import _ from 'lodash'
import {first, of} from 'rxjs'
import * as service from '#sepal/service'

const require = createRequire(import.meta.url)

const contextService = {
    serviceName: 'ContextService',
    serviceHandler$: () => {
        return of(require('#gee/config'))
    }
}

const getContext$ = () => service.submit$(contextService).pipe(first())

export {
    contextService,
    getContext$
}
