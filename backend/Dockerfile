FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# БД и загрузки лежат в томах (см. docker-compose.yml)
ENV EGE_DB=/data/ege.db
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8008"]
