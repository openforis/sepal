FROM debian:trixie-slim

RUN apt update && apt install -y curl libatomic1 netcat-traditional

RUN curl -fsSL https://lmstudio.ai/install.sh | bash

ADD ./start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

CMD ["/usr/local/bin/start.sh"]
