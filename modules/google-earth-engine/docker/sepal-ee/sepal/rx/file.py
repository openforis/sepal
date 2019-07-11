from rx import using
from rx.core.typing import Disposable


def using_file(file, mode, to_observable):
    def open_file():
        opened_file = open(file, mode)
        return _DisposableFile(opened_file)

    return using(open_file, lambda f: to_observable(f.opened_file))


class _DisposableFile(Disposable):
    def __init__(self, opened_file):
        self.opened_file = opened_file

    def dispose(self) -> None:
        self.opened_file.close()
