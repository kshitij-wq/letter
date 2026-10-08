FROM python:3.12-slim

# LibreOffice for PDFs, plus fonts with the same letter widths as Calibri, Cambria, Arial and Times New Roman.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libreoffice-writer fonts-crosextra-carlito fonts-crosextra-caladea fonts-liberation2 fontconfig \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn
COPY . .

ENV DJANGO_DEBUG=0 \
    DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1 \
    SOFFICE_PATH=/usr/bin/soffice \
    PYTHONUNBUFFERED=1

RUN DJANGO_SECRET_KEY=build python manage.py collectstatic --noinput
EXPOSE 8000
# Set DJANGO_SECRET_KEY when you run the container on a shared server.
CMD ["gunicorn", "letterstudio.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2", "--threads", "4", "--timeout", "180"]
