import os

# Tests must never depend on the real local credential.
os.environ.setdefault("DATA_GO_KR_SERVICE_KEY", "test-service-key")
