import logging
import threading
from threading import Thread

import httplib2
from apiclient import discovery
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)
DELAY_SECS = 60
MAX_FILE_AGE_MINS = 30


class DriveCleanup:
    SCOPES = 'https://www.googleapis.com/auth/drive'
    drive = None
    stopped = False

    def __init__(self, credentials):
        self.drive = discovery.build('drive', 'v3', http=(credentials.authorize(httplib2.Http())))
        self.stopped_event = threading.Event()

    def start(self):
        def job():
            logger.info("Scheduled drive cleanup job")
            while not self.stopped:
                self._delete_old_no_raise()
                self.stopped_event.wait(DELAY_SECS)

        Thread(target=job).start()
        return self

    def stop(self):
        logger.info("Stopping drive cleanup job")
        self.stopped = True
        self.stopped_event.set()

    def _delete_old_no_raise(self):
        try:
            self._delete_old()
        except:
            logger.exception('Failed to delete old drive files')

    def _delete_old(self):
        logger.info("Searching for old drive files")
        now = datetime.utcnow()
        oldest_to_keep = (now - timedelta(minutes=MAX_FILE_AGE_MINS)).isoformat("T")
        results = self.drive.files().list(q="modifiedTime <= '" + oldest_to_keep + "'",
                                          fields="files(id, name)").execute()
        files = results.get('files', [])
        for file in files:
            file_id = file['id']
            logger.info("Deleting old file id: " + file_id + ', name: ' + file['name'])
            self.drive.files().delete(fileId=file_id).execute()
