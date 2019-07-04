import ee

from .observable import ee_observable


def delete_asset(asset_id):
    def delete():
        if ee.data.getInfo(asset_id):
            ee.data.deleteAsset(asset_id)

    return ee_observable(delete, description='delete asset ' + asset_id)
