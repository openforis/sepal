"""Voila configuration file for the sandbox environment"""

import logging
from copy import deepcopy
from typing import List, Tuple
from jupyter_core.paths import jupyter_path
from jupyter_server.config_manager import recursive_update
from jupyterlab_server.config import get_page_config as gpc

from voila._version import __version__
from voila.configuration import VoilaConfiguration
from voila.utils import (
    filter_extension,
    maybe_inject_widgets_manager_extension,
    get_page_config,
)

# Configure logging
logging.basicConfig(
    # filename="/home/sepal-user/voila.log", # Uncomment to log to a file and make sure there's write permission
    level=logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)


def get_app_data(base_url: str, app_name: str) -> Tuple[List[str], str]:
    """Get the module data"""

    labextensions_url = f"/api/apps/labextensions/{app_name}/"
    app_labextensions_path = [
        f"/usr/local/share/jupyter/kernels/venv-{app_name}/venv/share/jupyter/labextensions/"
    ]
    # After voila>0.5.8 we need to add the voila labextensions path
    voila_labextensions_path = ["/usr/local/share/jupyter/voila/labextensions"]

    labextensions_path = app_labextensions_path + voila_labextensions_path

    return labextensions_path, labextensions_url


def is_sepal_ui_app(notebook_path: str) -> bool:
    """Check if the notebook is a sepal_ui app"""

    is_sepal_ui = notebook_path.startswith("shared/apps/")

    logging.debug(
        (f"::::Voila custom config ::: {notebook_path} is_sepal_ui_app", is_sepal_ui)
    )

    return is_sepal_ui


def get_app_name(notebook_path: str):
    """Extract the app name from the notebook path"""

    return notebook_path.split("apps/")[1].split("/")[0]


def page_config_hook(
    page_config: dict,
    base_url,
    settings,
    log,
    voila_configuration: VoilaConfiguration,
    notebook_path,
):

    if not is_sepal_ui_app(notebook_path):
        return get_page_config(
            base_url=base_url,
            settings=settings,
            log=log,
            voila_configuration=voila_configuration,
        )

    app_name = get_app_name(notebook_path)
    app_extensions_paths, app_extensions_url = get_app_data(base_url, app_name)
    page_config["fullLabextensionsUrl"] = app_extensions_url

    recursive_update(
        page_config,
        gpc(app_extensions_paths, logger=log),
    )
    disabled_extensions = [
        "@voila-dashboards/jupyterlab-preview",
        "@jupyter/collaboration-extension",
    ]
    disabled_extensions.extend(page_config.get("disabledExtensions", []))

    required_extensions = []
    federated_extensions = deepcopy(page_config["federated_extensions"])

    filtered_extensions = filter_extension(
        federated_extensions=federated_extensions,
        disabled_extensions=disabled_extensions,
        required_extensions=required_extensions,
        extension_allowlist=voila_configuration.extension_allowlist,
        extension_denylist=voila_configuration.extension_denylist,
    )

    extensions = maybe_inject_widgets_manager_extension(
        filtered_extensions, app_extensions_paths
    )

    page_config["federated_extensions"] = extensions

    logging.debug(
        ("::::Voila custom config ::: federated_extensions", federated_extensions)
    )

    return page_config


c.VoilaConfiguration.page_config_hook = page_config_hook
