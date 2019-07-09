from rx import Callable, Observable, of

from . import operators


def execute(
        action: Callable,
        retries: int = 3,
        description: str = None
) -> Observable:
    return of(True).pipe(
        operators.execute(
            mapper=lambda _: action(),
            retries=retries,
            description=description
        )
    )
