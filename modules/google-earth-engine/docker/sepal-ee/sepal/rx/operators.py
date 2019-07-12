import rx
from rx.operators import take_until

from . import _dispose


def take_until_disposed():
    return rx.pipe(
        take_until(_dispose)
    )
