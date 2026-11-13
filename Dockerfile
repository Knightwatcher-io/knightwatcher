# The Knightwatcher collector. Standard library only, so the image is the base and the package.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# uid and gid 10001: an account of its own, which should own nothing on the host.
RUN groupadd --gid 10001 knightwatcher \
 && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin knightwatcher

WORKDIR /app
COPY collector /app/collector
# Compiled at build time, since the root filesystem is read-only at run time.
RUN python -m compileall -q /app/collector

USER 10001:10001
ENTRYPOINT ["python", "-m", "collector"]
