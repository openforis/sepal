import time

from ..task.task import ThreadTask


def create(spec, context):
    print('assess_land_cover_map_accuracy, create: ', spec, context)
    return AssessLandCoverMapAccuracy()


class AssessLandCoverMapAccuracy(ThreadTask):
    def __init__(self):
        super(AssessLandCoverMapAccuracy, self).__init__('assess_land_cover_map_accuracy')

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
        print('AssessLandCoverMapAccuracy: status_message')
        return 'Some AssessLandCoverMapAccuracy status message'

    def close(self):
        print('AssessLandCoverMapAccuracy: close')
        pass

    def __str__(self):
        return '{0}()'.format(
            type(self).__name__
        )
