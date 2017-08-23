import json, hashlib, zlib, io, csv, time

from functools import wraps

from flask import session, request, redirect, render_template

def import_sepal_auth(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        sepalUser = request.headers.get('sepal-user')
        if not sepalUser:
            return render_template('401.html'), 401
        try:
            user = json.loads(sepalUser)
        except:
            return render_template('400.html'), 400
        session['username'] = user.get('username')
        session['roles'] = user.get('roles')
        session['is_admin'] = user.get('admin', False)
        session['googleTokens'] = user.get('googleTokens')
        accessToken = session['accessToken']
        if not session['accessToken'] and session['googleTokens']:
            accessToken = session['googleTokens'].get('accessToken')
        session['accessToken'] = accessToken
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

def propertiesFileToDict(filename):
    properties = {}
    with open(filename, 'r') as f:
        for line in f:
            line = line.rstrip()
            if line.startswith('#'):
                pass
            else:
                if '=' in line:
                    parts = line.partition('=')
                    value1 = parts[0]
                    value2 = parts[2]
                    if value2:
                        key = value1
                        properties[key] = value2
    return properties

def allowed_file(filename, allowedExtensions):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in allowedExtensions

def generate_id(value):
    hash_object = hashlib.md5(value)
    return hash_object.hexdigest()

def listToCSVRowString(lst):
    output = io.BytesIO()
    writer = csv.writer(output)
    writer.writerow(lst)
    return output.getvalue()

def crc32(file):
    prev = 0
    for eachLine in file:
        prev = zlib.crc32(eachLine, prev)
    return '%X' % (prev & 0xFFFFFFFF)

def getTimestamp():
    return str(int(time.time()))
