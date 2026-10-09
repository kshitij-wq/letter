"""Settings for Letter Studio: the Letter Tagger front end plus a Django back end
that checks templates with real Jinja (docxtpl), the engine CompUp fills letters with."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def load_env_file(path):
    """KEY=value lines from a .env file (never committed) into the environment, if not already set."""
    try:
        lines = Path(path).read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if key.startswith("export "):
            key = key[len("export "):].strip()
        os.environ.setdefault(key, value.strip().strip('"').strip("'"))


load_env_file(BASE_DIR / ".env")


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
# Locally the page's libraries are served straight from the app; collectstatic is only for a server.
WHITENOISE_USE_FINDERS = True
import warnings  # noqa: E402
warnings.filterwarnings("ignore", message="No directory at")
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Uploads: letters with images can be large.
MAX_UPLOAD_MB = int(os.environ.get("LS_MAX_UPLOAD_MB", "25"))
DATA_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_MB * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_MB * 1024 * 1024

# Checking and filling templates
LETTER_STUDIO = {
    # Escape &, < and > in employee data (recommended; see guide 11.3).
    "AUTOESCAPE": env_bool("LS_AUTOESCAPE", True),
    # Claude (optional): your Anthropic API key, from the .env file or the environment
    "CLAUDE_API_KEY": os.environ.get("ANTHROPIC_API_KEY", ""),
    "CLAUDE_MODEL": os.environ.get("LS_CLAUDE_MODEL", "claude-sonnet-5-5"),
    "CLAUDE_TIMEOUT": int(os.environ.get("LS_CLAUDE_TIMEOUT", "120")),
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "loggers": {"renderer": {"handlers": ["console"], "level": os.environ.get("LS_LOG_LEVEL", "INFO")}},
}
