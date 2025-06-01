bind = "0.0.0.0:8080"
workers = 1
worker_class = "sync"
timeout = 300  # Increased from 30 to 300 seconds for video processing
keepalive = 2
max_requests = 1000
max_requests_jitter = 100
preload_app = True 