import json

from functools import wraps

from flask import session, request, redirect, render_template

def import_sepal_auth(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        sepalUser = request.headers.get('sepal-user')
        if not sepalUser:
            return render_template('401.html'), 401
        user = json.loads(sepalUser)
        session['username'] = user.get('username')
        session['roles'] = user.get('roles')
        session['is_admin'] = user.get('admin', False)
        return f(*args, **kwargs)
    return wrapper

def requires_auth(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get('username'):
            return render_template('401.html'), 401
        return f(*args, **kwargs)
    return wrapper

def requires_role(*role):
    def wrapper(f):
        @wraps(f)
        def wrapped(*args, **kwargs):
            if session.get('roles') and role[0] in session.get('roles'):
                return f(*args, **kwargs)
            else:
                return render_template('401.html'), 401
        return wrapped
    return wrapper
