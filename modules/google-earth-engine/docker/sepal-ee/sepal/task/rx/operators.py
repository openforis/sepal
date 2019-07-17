from rx import of

from . import observables


def progress(default_message, message_key, **message_args):
    return of(True).pipe(
        observables.progress(default_message, message_key, **message_args)
    )
