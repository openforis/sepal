import ee

from ..sepal_exception import SepalException


def columns(table_id):
    try:
        return ee.FeatureCollection(table_id) \
            .first() \
            .propertyNames() \
            .sort() \
            .getInfo()
    except ee.ee_exception.EEException as e:
        handle_error(e, table_id)


def column_values(table_id, column_name):
    try:
        return ee.FeatureCollection(table_id) \
            .distinct(column_name) \
            .sort(column_name) \
            .aggregate_array(column_name) \
            .getInfo()
    except ee.ee_exception.EEException as e:
        handle_error(e, table_id)


def ee_map(table_id, column_name, column_value, color):
    try:
        collection = ee.FeatureCollection(table_id)
        filters = [ee.Filter.eq(column_name, column_value)]
        if is_number(column_value):
            filters.append(ee.Filter.eq(column_name, float(column_value)))
        collection = collection.filter(ee.Filter.Or(*filters))
        geometry = collection.geometry()
        bounds_polygon = ee.List(geometry.bounds().coordinates().get(0))
        bounds = ee.List([bounds_polygon.get(0), bounds_polygon.get(2)]).getInfo()
        ee_map = collection.getMapId({
            'color': color
        })
        return {
            'mapId': ee_map['mapid'],
            'token': ee_map['token'],
            'bounds': bounds
        }
    except ee.ee_exception.EEException as e:
        handle_error(e, table_id)


def query(select, from_table, where, order_by):
    try:
        collection = ee.FeatureCollection(from_table)
        for f in where:
            collection = collection.filterMetadata(f[0], f[1], f[2])
        for sort in order_by:
            collection = collection.sort(sort)
        rows = collection.reduceColumns(ee.Reducer.toList(len(select)), select) \
            .get('list').getInfo()
        return [{select[i]: value for i, value in enumerate(values)} for values in rows]

    except ee.ee_exception.EEException as e:
        handle_error(e, from_table)


def handle_error(e, table_id):
    try:
        asset = ee.data.getInfo(table_id)
    except ee.ee_exception.EEException:
        asset = None  # Malformed/incomplete table_id, or no permissions

    if not asset:
        raise SepalException(
            code='gee.table.error.notFound',
            message='Table not found',
            data={'tableId': table_id},
            cause=e
        )
    elif asset['type'] != 'FeatureCollection':
        raise SepalException(
            code='gee.table.error.notATable',
            message='Not a Table',
            data={'tableId': table_id},
            cause=e
        )
    else:
        raise e


def is_number(s):
    try:
        float(s)
        return True
    except:
        pass

    try:
        import unicodedata
        unicodedata.numeric(s)
        return True
    except (TypeError, ValueError):
        pass

    return False
