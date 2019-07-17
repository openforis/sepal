from rx import of

from . import operators


def progress(default_message, message_key, **message_args):
    return of(True).pipe(
        operators.progress(default_message, message_key, **message_args)
    )
