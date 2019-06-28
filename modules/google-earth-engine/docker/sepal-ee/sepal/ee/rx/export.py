import logging
import random

import ee
import rx
from ee.batch import Task
from rx import interval, from_callable, of
from rx.operators import flat_map, catch, delay, do_action, take_while, distinct_until_changed, concat
from rx.scheduler import ThreadPoolScheduler, TimeoutScheduler
from sepal.throttle import Throttler

ee_scheduler = ThreadPoolScheduler(50)

ee_export_throttler = Throttler(2)
ee_operation_throttler = Throttler(2)


def retry_with_backoff(retries, backoff=lambda times: min(pow(2, times * random.uniform(0.1, 0.2)), 30)):
    def do_retry(source, tries=1):
        if tries < retries:
            return of(None).pipe(
                delay(backoff(tries)),
                flat_map(source),
                catch(handler=lambda e, src: do_retry(src, tries + 1))
            )
        else:
            return source

    return rx.pipe(
        catch(handler=lambda e, o: do_retry(o))
    )


def ee_observable(action, retries=3):
    def execute():
        # credentials = load_credentials(
        #     '/Users/wiell/sepal-config/sepal-server/home/admin/.config/earthengine/credentials'
        # )
        # ee.InitializeThread(credentials)
        return action()

    # return ee_operation_throttler.throttle(from_callable(execute, ee_scheduler), 'some_group').pipe(
    #     retry_with_backoff(retries)
    # )
    # return ee_operation_throttler.throttle(from_callable(execute), 'some_group').pipe(
    #     retry_with_backoff(retries)
    # )
    # return from_callable(execute, ee_scheduler).pipe(
    #     retry_with_backoff(retries)
    # )
    return of(True).pipe(
        do_action(lambda _: print('before ee_observable')),
        flat_map(lambda _: from_callable(execute, TimeoutScheduler())),
        do_action(lambda _: print('after ee_observable')),
    )


def delete_asset(asset_id):
    def delete():
        if ee.data.getInfo(asset_id):
            ee.data.deleteAsset(asset_id)

    return ee_observable(delete)


def export_image_to_asset(image, asset_id, description):
    def create_task():
        return ee.batch.Export.image.toAsset(
            image=image,
            description=description,
            assetId=asset_id,
            crs='EPSG:4326',
            scale=30,
        )

    # export = delete_asset(asset_id).pipe(map(lambda _: create_task()), flat_map(lambda task: execute_task(task)))
    # return of('PENDING').pipe(
    #     concat(ee_export_throttler.throttle(export, 'some_group'))
    # )

    return ee_export_throttler.throttle(delete_asset(asset_id), 'some_group')


def execute_task(task):
    def load_state():
        status = task.status()
        # status = None
        return status['state']

    def start():
        print('start {}'.format(task))
        task.start()
        return task.status()['id']

    def monitor():
        def is_running(state):
            return state in [Task.State.UNSUBMITTED, Task.State.READY, Task.State.RUNNING]

        return interval(2, TimeoutScheduler()).pipe(
            flat_map(lambda _: ee_observable(load_state)),
            distinct_until_changed(),
            take_while(is_running, inclusive=True)
        )

    return ee_observable(start).pipe(
        flat_map(lambda _: monitor())
    )
