"""Serve repository guide data and generated HLS for an isolated simulator review."""

import argparse
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
from urllib.parse import urlsplit


def review_guide(root):
    raw = (root / "test_data/xmltv.xml").read_text()
    # Keep the fixture's relative airing times, with its known live window at now.
    shift = datetime.now(timezone.utc) - datetime(2026, 7, 18, 4, tzinfo=timezone.utc)

    def shift_time(match):
        timestamp = datetime.strptime(match[2], "%Y%m%d%H%M%S %z") + shift
        return f'{match[1]}="{timestamp:%Y%m%d%H%M%S %z}"'

    return re.sub(r'(start|stop)="(\d{14} [+-]\d{4})"', shift_time, raw).encode()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--media-root", type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    guide = review_guide(root)
    lines = (root / "test_data/channels.m3u").read_text().splitlines()
    playlist = "\n".join(
        "http://localhost:8409/iptv/channel/review.m3u8" if line.startswith("http") else line
        for line in lines
    ).encode()

    class Handler(BaseHTTPRequestHandler):
        def do_HEAD(self):
            self.respond(body=False)

        def do_GET(self):
            self.respond(body=True)

        def respond(self, body):
            path = urlsplit(self.path).path
            if path == "/iptv/channels.m3u":
                data, content_type = playlist, "audio/x-mpegurl"
            elif path == "/iptv/xmltv.xml":
                data, content_type = guide, "application/xml"
            elif path == "/iptv/channel/review.m3u8":
                data = (args.media_root / "stream.m3u8").read_bytes()
                content_type = "application/vnd.apple.mpegurl"
            elif re.fullmatch(r"/iptv/channel/segment\d+\.ts", path):
                data = (args.media_root / Path(path).name).read_bytes()
                content_type = "video/mp2t"
            else:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            if body:
                self.wfile.write(data)

    ThreadingHTTPServer(("127.0.0.1", 8409), Handler).serve_forever()


if __name__ == "__main__":
    main()
