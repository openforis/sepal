import ee
from ee.batch import Task
from rx import interval, of, throw
from rx.operators import distinct_until_changed, flat_map, take_while
from rx.scheduler import TimeoutScheduler

from sepal.rx.retry import retry_with_backoff
from sepal.rx.workqueue import WorkQueue

ee_exports = WorkQueue(2, 'ee_exports')
ee_operations = WorkQueue(20, 'ee_operations')


def ee_observable(action, retries=3, description=None):
    def execute():
        # credentials = load_credentials(
        #     '/Users/wiell/sepal-config/sepal-server/home/admin/.config/earthengine/credentials'
        # )
        # ee.InitializeThread(credentials)

        # if random.random() < 0.5:
        #     raise Exception('Randomly failed')
        # else:
        #     return action()
        #
        return action()

    return ee_operations.enqueue(
        callable=execute,
        retries=retries,
        group='not-grouped',
        description=description
    )


def delete_asset(asset_id):
    def delete():
        if ee.data.getInfo(asset_id):
            ee.data.deleteAsset(asset_id)

    return ee_observable(delete, description='delete asset ' + asset_id)


def export_image_to_asset(image, asset_id, description):
    def export():
        return delete_asset(asset_id).pipe(
            flat_map(
                lambda _: execute_task(
                    ee.batch.Export.image.toAsset(
                        image=image,
                        description=description,
                        assetId=asset_id,
                        crs='EPSG:4326',
                        scale=30,
                    )
                )
            )
        )

    return of('PENDING').pipe(
        flat_map(
            lambda _: ee_exports.enqueue(
                observable=export(),
                group='some_group',
                description=asset_id
            ),
        ),
        retry_with_backoff(
            retries=3,
            description='export_image_to_asset(asset_id={}, description={}'.format(
                asset_id, description)
        )
    )


def execute_task(task):
    def start():
        task.start()
        return task.status()['id']

    def load_status():
        return task.status()

    def extract_state(status):
        state = status['state']
        if state == 'FAILED':
            return throw(ee.EEException(status.get('error_message')))
        else:
            return of(state)

    def monitor():
        def is_running(state):
            return state in [Task.State.UNSUBMITTED, Task.State.READY, Task.State.RUNNING]

        return interval(2, TimeoutScheduler()).pipe(
            flat_map(lambda _: ee_observable(load_status, description='monitor task ' + str(task))),
            flat_map(extract_state),
            distinct_until_changed(),
            take_while(is_running, inclusive=True)
        )

    return ee_observable(start, description='start task ' + str(task)).pipe(
        flat_map(lambda _: monitor())
    )
