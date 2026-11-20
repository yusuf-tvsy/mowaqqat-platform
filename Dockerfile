FROM python:3.12-slim
LABEL org.opencontainers.image.title="Kader Python dependencies" \
      org.opencontainers.image.description="Preinstalled Python packages only; Kader source stays on mounted private volume"
ENV KADER_PREBUILT_REQUIREMENTS_SHA256=5063ed0220a0a5bcd317ecc741b4ef842b4746286217c8e1e8bd054003cca129
COPY requirements.txt /opt/kader-deps/requirements.txt
RUN python -m pip install --no-cache-dir -r /opt/kader-deps/requirements.txt \
 && python -m pip check \
 && python -c "import fastapi, uvicorn, sqlalchemy, psycopg, boto3, pypdf, defusedxml, PIL, uvloop, httptools, watchfiles; print('KADER_BUILD_PYTHON_DEPS_READY')"
