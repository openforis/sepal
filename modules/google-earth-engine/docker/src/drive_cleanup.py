import logging
from threading import Thread

import httplib2
import schedule
import time
from apiclient import discovery
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)
_MAX_FILE_AGE_MINS = 30


class DriveCleanup:
    SCOPES = 'https://www.googleapis.com/auth/drive'
    _drive = None
    _running = False

    def __init__(self, credentials):
        self._drive = discovery.build('drive', 'v3', http=(credentials.authorize(httplib2.Http())))

    def start(self):
        schedule.every().minute.do(
            self._delete_old_no_raise
        )

        def job():
            self._running = True
            schedule.run_all()
            while self._running:
                schedule.run_pending()
                time.sleep(10)

        Thread(target=job).start()
        return self

    def stop(self):
        logger.info("Stopping scheduler")
        self._running = False

    def _delete_old_no_raise(self):
        logger.info("Deleting old files")
        try:
            self._delete_old()
        except:
            import traceback
            print(traceback.format_exc())

    def _delete_old(self):
        now = datetime.utcnow()
        oldest_to_keep = (now - timedelta(minutes=_MAX_FILE_AGE_MINS)).isoformat("T")
        results = self._drive.files().list(q='modifiedTime <= \'' + oldest_to_keep + '\'',
                                           fields="files(id, name)").execute()
        files = results.get('files', [])
        for file in files:
            file_id = file['id']
            logger.debug("Deleting id: " + file_id + ', ' + file['name'])
            self._drive.files().delete(fileId=file_id).execute()
