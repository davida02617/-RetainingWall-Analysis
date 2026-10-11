FROM python:3.12-slim
WORKDIR /app
COPY retaining_wall ./retaining_wall
USER 65534:65534
EXPOSE 8788
CMD ["python", "-m", "retaining_wall.server", "--host", "0.0.0.0", "--port", "8788"]
