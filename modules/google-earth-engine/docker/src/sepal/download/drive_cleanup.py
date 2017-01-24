import logging
import threading
from threading import Thread

import httplib2
from apiclient import discovery
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)
DELAY_SECS = 60
MAX_FOLDER_AGE_MINS = 60 * 24 * 7  # A week
MAX_FILE_AGE_MINS = 60  # An hour


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
        max_file_modification = (now - timedelta(minutes=MAX_FILE_AGE_MINS)).isoformat("T")
        max_folder_modification = (now - timedelta(minutes=MAX_FOLDER_AGE_MINS)).isoformat("T")
        query = "(mimeType != 'application/vnd.google-apps.folder' and modifiedTime <= '%s') " \
                "or (mimeType = 'application/vnd.google-apps.folder' and modifiedTime <= '%s')" \
                % (max_file_modification, max_folder_modification)
        results = self.drive.files().list(q=query, fields="files(id, name)").execute()
        files = results.get('files', [])
        for file in files:
            file_id = file['id']
            logger.info("Deleting old file id: " + file_id + ', name: ' + file['name'])
            self.drive.files().delete(fileId=file_id).execute()
