# Knightwatcher: the collector and the bundled server, one image. Standard library only, so the
# image is the base, the two packages and the page. compose.yaml runs the collector by default
# and the server with `python -m server`.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# uid and gid 10001: an account of its own, which should own nothing on the host.
RUN groupadd --gid 10001 knightwatcher \
 && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin knightwatcher

WORKDIR /app
# The collector, with the settings schema it checks config.toml against.
COPY collector /app/collector
# The server, which reuses the collector's checks for the shared settings.
COPY server /app/server
COPY web /app/web
# The page is stamped with its version as tools/deploy.sh stamps a deployed copy, so that open
# displays reload themselves onto a new image. The packages are compiled at build time, since the
# root filesystem is read-only at run time.
RUN python -m server.stamp /app/web \
 && python -m compileall -q /app/collector /app/server

USER 10001:10001
ENTRYPOINT ["python", "-m", "collector"]
