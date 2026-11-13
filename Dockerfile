# The Knightwatch collector. Standard library only, so the image is the base and the package.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# uid and gid 1000, to match the owner of the folder the state file is written to.
RUN groupadd --gid 1000 knightwatch \
 && useradd --uid 1000 --gid 1000 --no-create-home --shell /usr/sbin/nologin knightwatch

WORKDIR /app
COPY collector /app/collector
# Compiled at build time, since the root filesystem is read-only at run time.
RUN python -m compileall -q /app/collector

USER 1000:1000
ENTRYPOINT ["python", "-m", "collector"]
