const {Observable, Disposable} = require('rxjs')

export const onUnsubscribe = action =>
    source => {
        const subscribe = observer => {
            const subscription = source.subscribe(observer)
            const dispose = () => {
                subscription.unsubscribe()
                action()
            }
            return Disposable(dispose)
        }
        return Observable(subscribe)
    }
