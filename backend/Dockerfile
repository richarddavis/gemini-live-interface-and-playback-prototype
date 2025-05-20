FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

# Use CMD as array of arguments to pass to the entrypoint
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "wsgi:app"] 