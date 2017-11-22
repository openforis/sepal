from factory import create

_task_by_id = {}


def submit(id, spec):
    _task_by_id[id] = create(spec)


def status(id):
    return _get_task(id).status()


def cancel(id):
    _get_task(id).cancel()


def _get_task(id):
    return _task_by_id[id]
