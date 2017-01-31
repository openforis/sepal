import raster
import render
import shape


def list_layers(state):
    ids = [id for id, index in sorted(_index_by_id(state).items(), key=lambda (id, index): index)]
    return [_layer_by_id(state)[id].to_dict() for id in ids]


# [ "some-id", "another-id" ]
def reorder(order, state):
    _index_by_id(state).clear()
    index_by_id = {id: index for index, id in enumerate(order)}
    _index_by_id(state).update(index_by_id)


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
def save_raster(layer_dict, state):
    """Saves raster layer and returns bounding box of layer [[min lat, min lng], max lat, max lng]"""
    if _is_new_layer(layer_dict, state):
        layer = raster.create(layer_dict)
    else:
        layer = _update_layer(layer_dict, state)
    return _save_layer(layer, state)


def save_shape(layer_dict, state):
    if _is_new_layer(layer_dict, state):
        layer = shape.create(layer_dict)
    else:
        layer = _update_layer(layer_dict, state)
    return _save_layer(layer, state)


def remove_layer(layer_id, state):
    del _layer_by_id(state)[layer_id]
    del _index_by_id(state)[layer_id]
    render.remove(layer_id, _renderers(state))


def features(lat, lng, state):
    return {
        id: layer.features(lat, lng)
        for id, layer in _layer_by_id(state).iteritems()
    }


def _is_new_layer(layer_dict, state):
    return layer_dict['id'] not in _layer_by_id(state).keys()


def _update_layer(layer_dict, state):
    return _layer_by_id(state)[layer_dict['id']].update(layer_dict)


def _save_layer(layer, state):
    index_by_id = _index_by_id(state)
    if not index_by_id.has_key(layer.id):
        index_by_id[layer.id] = len(index_by_id)
    _layer_by_id(state)[layer.id] = layer
    render.create_renderer(layer, _renderers(state))
    return layer.bounds()


def _layer_by_id(state):
    return state['layer_by_id']


def _index_by_id(state):
    return state['index_by_id']


def _renderers(state):
    return state['renderers']
