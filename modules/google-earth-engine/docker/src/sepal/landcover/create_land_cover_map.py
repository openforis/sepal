import time

from ..task.task import ThreadTask


def create(spec, context):
    print('create_land_cover_map, create: ', spec, context)
    return CreateLandCoverMap()


class CreateLandCoverMap(ThreadTask):
    def __init__(self):
        super(CreateLandCoverMap, self).__init__('create_land_cover_map')

    def run(self):
        # For each composite and training data collection
        #   Sample - export to drive
        #   Train and classify (training in a separate step?) - export as asset
        # Then assemble - export as asset

        time.sleep(1)
        self.resolve()

    def status_message(self):
        return 'Some CreateLandCoverMap status message'

    def __str__(self):
        return '{0}()'.format(
            type(self).__name__
        )
