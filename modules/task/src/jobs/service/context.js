import _ from 'lodash'
import {createRequire} from 'module'
import {first} from 'rxjs'

import * as service from '#sepal/service'

const require = createRequire(import.meta.url)

const contextService = {
    serviceName: 'ContextService',
    serviceHandler$: () => require('#task/context').getContext$()
}

const getContext$ = () => service.submit$(contextService)
const getCurrentContext$ = () => service.submit$(contextService).pipe(first())

export {
    contextService,
    getContext$,
    getCurrentContext$
}
