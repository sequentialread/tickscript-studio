FROM buildpack-deps:jessie-scm

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        graphviz \
    && rm -rf /var/lib/apt/lists/*

COPY config.json clearFile.sh tickscript-studio VERSION ./
COPY server server
COPY static static
COPY frontend frontend

RUN chmod +x clearFile.sh

EXPOSE 8081

CMD [ "./tickscript-studio" ]
