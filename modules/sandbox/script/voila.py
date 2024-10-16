"""Voila configuration file for the sandbox environment"""

print("::::Voila labextensions::: Using custom sepal configuration file imported")
from copy import deepcopy
from typing import List, Tuple
from jupyter_core.paths import jupyter_path
from jupyter_server.config_manager import recursive_update
from jupyterlab_server.config import get_page_config as gpc

from voila._version import __version__
from voila.configuration import VoilaConfiguration
from voila.utils import filter_extension


def get_app_data(base_url: str, app_name: str) -> Tuple[List[str], str]:
    """Get the module data"""

    # To the logic to get the app data
    jupyter_url = f"/api/apps/labextensions/{app_name}/"
    jupyter_paths = [
        f"/usr/local/share/jupyter/kernels/venv-{app_name}/venv/share/jupyter/labextensions/"
    ]

    print("::::Voila labextensions::: jupyter_path", jupyter_path)
    print("::::Voila labextensions::: jupyter_url", jupyter_url)

    return jupyter_paths, jupyter_url


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
    print("::::Voila labextensions::: Custom get_page_config_hook")
    print("::::Voila labextensions::: notebook_path", notebook_path)

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
        "@jupyter-widgets/jupyterlab-manager",
        "@jupyterhub/jupyter-server-proxy",  # This was causing an error in the console
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

    print("::::Voila labextensions::: page_config", page_config)

    return page_config


c.VoilaConfiguration.page_config_hook = page_config_hook
