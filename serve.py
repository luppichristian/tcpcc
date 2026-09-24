#!/usr/bin/env python3

"""Serve the TCP congestion-control visualizer on localhost and open it."""

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
import sys
import webbrowser

PORT = 8765
os.chdir(Path(__file__).resolve().parent)
url = f"http://127.0.0.1:{PORT}/"

try:
    server = ThreadingHTTPServer(("127.0.0.1", PORT), SimpleHTTPRequestHandler)
except OSError as error:
    print(f"Could not start {url}: {error}", file=sys.stderr)
    print("Another copy may already be running. Open the URL above in your browser.", file=sys.stderr)
    raise SystemExit(1)

print(f"TCP CC Visualizer is running at {url}")
print("Press Ctrl+C in this window to stop it.")

webbrowser.open(url)

try:
    server.serve_forever()
except KeyboardInterrupt:
    print("\nServer stopped.")
finally:
    server.server_close()