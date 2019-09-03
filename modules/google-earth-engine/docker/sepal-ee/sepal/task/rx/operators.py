import rx
from rx.operators import map
from sepal.task.progress import Progress


def progress(default_message, message_key, **message_args):
    return rx.pipe(
        map(lambda _: Progress(default_message, message_key, **message_args))
    )
