from __future__ import print_function

import logging

import ee
from flask import Flask, render_template

import download_server
import server
from sepal import gee

modules = [server, download_server]
app = Flask(__name__)


@app.before_request
def before():
    gee.init_ee()


@app.route('/')
def index():
    countries = ee.FeatureCollection('ft:15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F') \
        .filterMetadata('NAME_FAO', 'not_equals', '')
    isos = countries.sort('NAME_FAO').aggregate_array('ISO').getInfo()
    names = countries.sort('NAME_FAO').aggregate_array('NAME_FAO').getInfo()
    countries = zip(isos, names)
    return render_template('index.html', countries=countries)


def init():
    print('Init running')
    for module in modules:
        app.register_blueprint(module.http)
        module.init()


def destroy():
    for module in modules:
        module.destroy()


if __name__ == '__main__':
    init()
    logging.basicConfig(level=logging.DEBUG)
    app.run(threaded=True, port=5001)

destroy()
