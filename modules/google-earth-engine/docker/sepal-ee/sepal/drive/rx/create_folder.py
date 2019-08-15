from sepal.drive import get_service
from sepal.drive.rx.observables import execute


def create_folder(credentials, parent, name, retries: int = 5):
    path = '{}{}/'.format(parent['path'], name)

    def action():
        folder = get_service(credentials).files().create(
            body={'name': name, 'parents': [parent['id']], 'mimeType': 'application/vnd.google-apps.folder'},
            fields='id').execute()
        folder['path'] = path
        folder['name'] = name
        return folder

    return execute(credentials, action, description='create_folder {}'.format(path), retries=retries)
