FROM ubuntu:focal

# [HACK] glibc fails with kernel revision >= 255. This hack fakes the revision.
# Remove once a new glibc verison in inclued in the ubuntu parent image.
# https://bugs.launchpad.net/ubuntu/+source/glibc/+bug/1962225
RUN mv /bin/uname /bin/uname.orig && printf '#!/bin/bash\n\nif [[ "$1" == "-r" ]] ;then\n echo '4.9.250'\n exit\nelse\n uname.orig "$@"\nfi' > /bin/uname && chmod 755 /bin/uname

ENV MODULE_NAME backup
ADD modules/${MODULE_NAME}/script /script
RUN chmod -R 500 /script && sync && \
    /script/init_image.sh

CMD ["/script/init_container.sh"]
