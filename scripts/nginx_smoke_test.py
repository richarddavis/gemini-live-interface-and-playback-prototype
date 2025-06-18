import requests
import sys

def main():
    try:
        resp = requests.get("http://localhost/api/health", timeout=5)
        if resp.status_code == 200 and resp.json().get("status") == "healthy":
            print("✅ Nginx proxy to backend is working!")
            sys.exit(0)
        print(f"❌ Unexpected response: {resp.status_code} {resp.text}")
    except Exception as exc:
        print(f"❌ Request failed: {exc}")

if __name__ == "__main__":
    main() 