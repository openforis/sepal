from flask import Flask

template_folder = 'templates'
app = Flask(__name__, instance_relative_config=True, template_folder=template_folder, static_url_path='/static', static_folder='../static')
app.config.from_object('config')
app.config.from_pyfile('config.py', silent=True)

app.secret_key = app.config['SESSION_SECRET_KEY']

@app.before_first_request
def beforeFirstRequest(*args, **kwargs):
    pass

import api, web
