import time

from ..task.task import ThreadTask


def create(spec, context):
    print('create_land_cover_map, create: ', spec, context)
    return CreateLandCoverMap()


class CreateLandCoverMap(ThreadTask):
    def __init__(self):
        super(CreateLandCoverMap, self).__init__('create_land_cover_map')

    def run(self):
        time.sleep(1)
        # TODO: Asset directory path as input?
        # Create a composite per year
        # Export as asset
        # {2015: /foo/bar/baz}
        self.resolve()

    # def status(self):
    #     print('CreateComposites: status')
    #     return super.status()

    def status_message(self):
        print('CreateLandCoverMap: status_message')
        return 'Some CreateLandCoverMap status message'

    def close(self):
        print('CreateLandCoverMap: close')
        pass

    def __str__(self):
        return '{0}()'.format(
            type(self).__name__
        )
