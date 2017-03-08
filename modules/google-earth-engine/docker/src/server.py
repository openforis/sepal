import json
import logging

from flask import Flask, Blueprint, Response, request

from sepal import Aoi, image_spec_factory
from sepal import credentials
from sepal.download.drive_cleanup import DriveCleanup

app = Flask(__name__)
http = Blueprint(__name__, __name__)

drive_cleanup = None


@http.route('/preview', methods=['POST'])
def preview():
    image_spec = image_spec_factory.create(json.loads(request.values['image']))
    image_preview = image_spec.preview()
    return Response(json.dumps(image_preview), mimetype='application/json')


@http.route('/sceneareas')
def scene_areas():
    aoi = Aoi.create(json.loads(request.values['aoi']))
    areas = aoi.scene_areas(request.values.get('dataSet', 'LANDSAT'))
    return Response(json.dumps(areas), mimetype='application/json')

@http.route('/best-scenes')
def best_scenes():
    data_set = request.values['dataSet']
    from_date = int(request.values['fromDate'])
    to_date = int(request.values['toDate'])
    target_day_of_year = int(request.values['targetDayOfYear'])
    target_day_of_year_weight = float(request.values['targetDayOfYearWeight'])
    aoi = Aoi.create(json.loads(request.values['aoi']))
    scenes = aoi.best_scenes(
        data_set=data_set,
        from_date=from_date,
        to_date=to_date,
        target_day_of_year=target_day_of_year,
        target_day_of_year_weight=target_day_of_year_weight
    )
    return Response(json.dumps(scenes), mimetype='application/json')


def init():
    global drive_cleanup
    drive_cleanup = DriveCleanup(credentials)
    drive_cleanup.start()


def destroy():
    if drive_cleanup:
        drive_cleanup.stop()


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    init()
    app.register_blueprint(http)
    app.run(host='0.0.0.0', threaded=True, port=5001)

destroy()
