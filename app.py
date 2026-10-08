from pathlib import Path
import argparse

from flask import Flask, abort, send_from_directory


ROOT = Path(__file__).resolve().parent
app = Flask(__name__)
ASSETS = {"app.js", "styles.css", "catalog.js"}


@app.get("/")
def index():
    return send_from_directory(ROOT, "index.html")


@app.get("/<path:asset>")
def static_asset(asset: str):
    if asset not in ASSETS:
        abort(404)
    return send_from_directory(ROOT, asset)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Serve the StarMap site on your local network.")
    parser.add_argument("--host", default="0.0.0.0", help="Bind address (default: all network interfaces)")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on (default: 8000)")
    args = parser.parse_args()
    app.run(host=args.host, port=args.port, debug=False)