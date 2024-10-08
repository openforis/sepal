print("Using custom sepal configuration file imported")
import os
from copy import deepcopy

from jupyter_core.paths import jupyter_path
from jupyter_server.config_manager import recursive_update
from jupyter_server.utils import url_path_join
from jupyterlab_server.config import get_page_config as gpc

from voila._version import __version__
from voila.configuration import VoilaConfiguration
from voila.utils import filter_extension
from voila.app import Voila


def get_app_data(app_name):
    home_dir = os.path.expanduser("~")
    return os.path.join(
        home_dir,
        ".sepal-data",
        "sepal",
        "jupyter",
        "current-kernels",
        app_name,
        "venv",
        "share",
        "jupyter",
        "labextensions",
    )

    # if something fails, return the default labextensions url

    return jupyter_path("labextensions"), url_path_join(base_url, "voila/labextensions")


def get_app_name(notebook_path):
    """Extract the app name from the notebook path"""


def get_page_config_hook(
    _, base_url, settings, log, voila_configuration: VoilaConfiguration, notebook_path
):

    print("This is the custom get_page_config_hook")

    app_name = get_app_name(notebook_path)
    app_extensions_path, app_extensions_url = get_app_data(app_name)

    page_config = {
        "appVersion": __version__,
        "appUrl": "voila/",
        "themesUrl": "/voila/api/themes",
        "baseUrl": base_url,
        "terminalsAvailable": False,
        "fullStaticUrl": url_path_join(base_url, "voila/static"),
        "fullLabextensionsUrl": app_extensions_url,
        "extensionConfig": voila_configuration.extension_config,
    }
    mathjax_config = settings.get("mathjax_config", "TeX-AMS_CHTML-full,Safe")
    mathjax_url = settings.get(
        "mathjax_url", "https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.7/MathJax.js"
    )
    page_config.setdefault("mathjaxConfig", mathjax_config)
    page_config.setdefault("fullMathjaxUrl", mathjax_url)

    recursive_update(
        page_config,
        gpc(
            app_extensions_path,
            logger=log,
        ),
    )
    disabled_extensions = [
        "@voila-dashboards/jupyterlab-preview",
        "@jupyter/collaboration-extension",
        "@jupyter-widgets/jupyterlab-manager",
    ]
    disabled_extensions.extend(page_config.get("disabledExtensions", []))
    required_extensions = []
    federated_extensions = deepcopy(page_config["federated_extensions"])

    page_config["federated_extensions"] = filter_extension(
        federated_extensions=federated_extensions,
        disabled_extensions=disabled_extensions,
        required_extensions=required_extensions,
        extension_allowlist=voila_configuration.extension_allowlist,
        extension_denylist=voila_configuration.extension_denylist,
    )
    return page_config


Voila.get_page_config_hook = get_page_config_hook
