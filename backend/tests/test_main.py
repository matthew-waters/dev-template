from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_hello_default():
    response = client.get("/api/hello")
    assert response.json() == {"message": "Hello, world!"}


def test_hello_name():
    response = client.get("/api/hello", params={"name": "GitLab"})
    assert response.json() == {"message": "Hello, GitLab!"}
