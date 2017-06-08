from flask import Flask

app = Flask(__name__, instance_relative_config=True, static_url_path="/static", static_folder="../static")
app.config.from_object('config')
app.config.from_pyfile('config.py', silent=True)

app.secret_key = app.config['SESSION_SECRET_KEY']

from flask_pymongo import PyMongo
mongo = PyMongo(app)

@app.before_first_request
def beforeFirstRequest(*args, **kwargs):
    mongo.db.projects.create_index('id')
    mongo.db.projects.create_index('username')
    mongo.db.projects.create_index([("upload_datetime", 1)])
    mongo.db.records.create_index('id')
    mongo.db.records.create_index('project_id')

import api, web
