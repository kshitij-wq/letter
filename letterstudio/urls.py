from django.urls import include, path

urlpatterns = [
    path("", include("renderer.urls")),
]
