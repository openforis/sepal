import raster
import render
import shape

_layer_by_id = {}
_index_by_id = {}


def list_layers():
    ids = [id for id, index in sorted(_index_by_id.items(), key=lambda (id, index): index)]
    return [_layer_by_id[id].to_dict() for id in ids]


# [ "some-id", "another-id" ]
def reorder(order):
    _index_by_id.clear()
    index_by_id = {id: index for index, id in enumerate(order)}
    _index_by_id.update(index_by_id)


# {
#   "id": "some-id",
#   "path": "LE71900312016202NSG00/scene.vrt",
#   "bands": [
#     {
#       "index": "1",
#       "palette": [[890, "#000000"], [5000, "#0000FF"]]
#     }
#   ]
# }
def save_raster(layer_dict):
    """Saves raster layer and returns bounding box of layer [[min lat, min lng], max lat, max lng]"""
    if _is_new_layer(layer_dict):
        layer = raster.from_dict(layer_dict)
    else:
        layer = _update_layer(layer_dict)
    return _save_layer(layer)


def save_shape(layer_dict):
    if _is_new_layer(layer_dict):
        layer = shape.from_dict(layer_dict)
    else:
        layer = _update_layer(layer_dict)
    return _save_layer(layer)


def remove_layer(layer_id):
    del _layer_by_id[layer_id]
    del _index_by_id[layer_id]
    render.remove(layer_id)


def features(lat, lng):
    return {
        id: layer.features(lat, lng)
        for id, layer in _layer_by_id.iteritems()
        }


def _is_new_layer(layer_dict):
    return layer_dict['id'] not in _layer_by_id.keys()


def _update_layer(layer_dict):
    return _layer_by_id[layer_dict['id']].update(layer_dict)


def _save_layer(layer):
    if not _index_by_id.has_key(layer.id):
        _index_by_id[layer.id] = len(_index_by_id)
    _layer_by_id[layer.id] = layer
    render.create_renderer(layer)
    return layer.bounds()
