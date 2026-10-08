"""Settings for Letter Studio: the Letter Tagger front end plus a Django back end
that fills templates with real Jinja (docxtpl) and converts them to PDF with LibreOffice."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def env_bool(name, default=False):
    return os.environ.get(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


# Local use by default. Set DJANGO_SECRET_KEY and DJANGO_DEBUG=0 before putting it on a shared server.
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-change-me-letter-studio")
DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = [h.strip() for h in os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,[::1]").split(",") if h.strip()]
CSRF_TRUSTED_ORIGINS = [o.strip() for o in os.environ.get("DJANGO_CSRF_TRUSTED_ORIGINS", "").split(",") if o.strip()]

INSTALLED_APPS = [
    "django.contrib.staticfiles",
    "renderer",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",  # serves the page's libraries when DEBUG is off
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# The PDF preview is shown in a frame on the same page.
X_FRAME_OPTIONS = "SAMEORIGIN"

ROOT_URLCONF = "letterstudio.urls"
WSGI_APPLICATION = "letterstudio.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": []},
    }
]

# No database is needed for rendering. SQLite is configured so the app can grow
# (template library, tag registry) without extra setup.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

LANGUAGE_CODE = "en-us"
TIME_ZONE = os.environ.get("TIME_ZONE", "Asia/Kolkata")
USE_I18N = False
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Uploads: letters with images can be large.
MAX_UPLOAD_MB = int(os.environ.get("LS_MAX_UPLOAD_MB", "25"))
DATA_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_MB * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_MB * 1024 * 1024

# Rendering and PDF conversion
LETTER_STUDIO = {
    # Path to soffice / libreoffice. Leave empty to search the usual places.
    "SOFFICE_PATH": os.environ.get("SOFFICE_PATH", ""),
    # How many LibreOffice conversions may run at once.
    "PDF_PARALLEL": int(os.environ.get("LS_PDF_PARALLEL", "2")),
    "PDF_TIMEOUT": int(os.environ.get("LS_PDF_TIMEOUT", "120")),
    # Escape &, < and > in employee data (recommended; see guide 11.3).
    "AUTOESCAPE": env_bool("LS_AUTOESCAPE", True),
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "loggers": {"renderer": {"handlers": ["console"], "level": os.environ.get("LS_LOG_LEVEL", "INFO")}},
}
