import importlib

_task_by_id = {}


def submit(id, module, spec, context):
    factory = importlib.import_module(name=module)
    task = factory.create(spec, context)
    _task_by_id[id] = task
    task.submit().catch(_re_raise)


def status(id):
    task = _get_task(id)
    message = task.status_message()
    state = 'ACTIVE'
    if task.resolved():
        state = 'COMPLETED'
    elif task.canceled():
        state = 'CANCELED'
    elif task.rejected():
        state = 'FAILED'
    return {'state': state, 'message': message}


def cancel(id):
    _get_task(id).cancel()


def close():
    for id in _task_by_id:
        _task_by_id[id].cancel()


def _re_raise(exception):
    exception.re_raise()


def _get_task(id):
    return _task_by_id[id]
