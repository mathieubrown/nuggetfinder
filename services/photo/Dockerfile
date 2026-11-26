FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY process_image.py worker.py ./
ENV PYTHONDONTWRITEBYTECODE=1
USER 65532:65532
ENTRYPOINT ["python", "worker.py"]
