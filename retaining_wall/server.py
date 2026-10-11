"""Local-only web server, no third-party dependencies."""
import argparse
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from .core import analyze, presets, VERSION

WEB = Path(__file__).resolve().parent / 'web' / 'professional'

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB), **kwargs)

    def send_json(self, value, status=200):
        data = json.dumps(value, ensure_ascii=False, allow_nan=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/api/presets':
            return self.send_json({'version': VERSION, 'walls': presets()})
        if self.path == '/api/health':
            return self.send_json({'version': VERSION, 'status': 'ok'})
        super().do_GET()

    def do_POST(self):
        if self.path != '/api/analyze':
            return self.send_json({'error': '找不到 API'}, 404)
        origin = self.headers.get('Origin')
        if origin and origin != 'http://' + self.headers.get('Host', ''):
            return self.send_json({'error': '僅允許同來源請求'}, 403)
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 100_000:
                raise ValueError('請求需為 1–100000 bytes')
            data = json.loads(self.rfile.read(size))
            self.send_json(analyze(data))
        except (ValueError, TypeError, UnicodeDecodeError) as exc:
            self.send_json({'error': str(exc)}, 422)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8788)
    args = parser.parse_args()
    print(f'RetainingWall {VERSION}: http://{args.host}:{args.port}', flush=True)
    with ThreadingHTTPServer((args.host, args.port), Handler) as server:
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass

if __name__ == '__main__':
    main()
