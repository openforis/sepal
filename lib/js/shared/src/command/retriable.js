const {first, of, switchMap, tap} = require('rxjs')
const {retry} = require('sepal/rxjs')
const {v4: uuid} = require('uuid')

const retriableCommandHandler = nextHandler$ =>
    ({services, command, ...args}) => {
        const {store} = services
        const commandKey = uuid()

        const toRetriable$ = stream$ => {
            const stepKey = uuid()
            return of(true).pipe(
                switchMap(() => store.loadStep$(commandKey, stepKey)),
                switchMap(step => step ? step.value : stream$()),
                first(),
                tap(value => store.completedStep$(commandKey, stepKey, value))
            )
        }

        const delegateHandle$ = () => nextHandler$({
            services,
            command,
            ...args,
            toRetriable$
        })

        return of(true).pipe(
            tap(() => store.startedCommand$(command, commandKey)),
            switchMap(delegateHandle$),
            first(),
            retry(4), // TODO: How many? How to react when we reach the limit?
            tap(() => store.completedCommand$(commandKey))
        )
    }

module.exports = {retriableCommandHandler}
