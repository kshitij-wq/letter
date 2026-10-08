from django.urls import path

from . import views

urlpatterns = [
    path("", views.index, name="index"),
    path("api/health", views.health, name="health"),
    path("api/render", views.render, name="render"),
    path("api/validate", views.validate, name="validate"),
]
