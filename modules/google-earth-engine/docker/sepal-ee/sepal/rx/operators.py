import rx
from rx import Callable, Observable
from rx.disposable import Disposable
from rx.operators import take_until

from . import _dispose


def take_until_disposed():
    return rx.pipe(
        take_until(_dispose)
    )


def on_dispose(action: Callable):
    def _subscription_listener(source: Observable) -> Observable:
        def subscribe(observer, scheduler=None):
            subscription = source.subscribe(observer, scheduler=scheduler)

            def dispose():
                subscription.dispose()
                action()

            return Disposable(dispose)

        return Observable(subscribe)

    return _subscription_listener
