import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from retaining_wall.server import Handler

class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start();cls.url=f'http://127.0.0.1:{cls.server.server_port}'
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join()
    def test_home_and_presets(self):
        with urlopen(self.url+'/') as r:self.assertIn('擋土牆'.encode(),r.read())
        with urlopen(self.url+'/api/presets') as r:self.assertEqual(len(json.load(r)['walls']),3)
    def test_analyze(self):
        req=Request(self.url+'/api/analyze',data=b'{}',headers={'Content-Type':'application/json'})
        with urlopen(req) as r:self.assertEqual(json.load(r)['engine_version'],'0.1.0')
    def test_bad_inputs(self):
        for payload in (b'[]',b'{',b'{"height":-1}'):
            with self.assertRaises(HTTPError) as err:urlopen(Request(self.url+'/api/analyze',data=payload))
            self.assertEqual(err.exception.code,422)
    def test_cross_origin_rejected(self):
        with self.assertRaises(HTTPError) as err:
            urlopen(Request(self.url+'/api/analyze',data=b'{}',headers={'Origin':'https://example.com'}))
        self.assertEqual(err.exception.code,403)
