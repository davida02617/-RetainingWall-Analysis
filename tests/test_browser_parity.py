"""Numerical parity across runtimes, including fail/pending/unsupported cases."""
import json,math,random,subprocess,unittest,shutil
from pathlib import Path
from retaining_wall.core import analyze,presets
ROOT=Path(__file__).resolve().parents[1]

@unittest.skipUnless(shutil.which('node'), 'Browser parity requires Node.js')
class BrowserParityTests(unittest.TestCase):
    def compare(self,a,b,path='root'):
        if isinstance(a,dict):
            self.assertEqual(set(a),set(b),path)
            for k in a:self.compare(a[k],b[k],path+'.'+k)
        elif isinstance(a,(list,tuple)):
            self.assertEqual(len(a),len(b),path)
            for i,(x,y) in enumerate(zip(a,b)):self.compare(x,y,path+f'[{i}]')
        elif isinstance(a,(int,float)) and not isinstance(a,bool):
            self.assertTrue(math.isclose(a,b,rel_tol=1e-10,abs_tol=1e-10),f'{path}: {a} != {b}')
        else:self.assertEqual(a,b,path)

    def test_python_browser_parity(self):
        rng=random.Random(20261011)
        cases=presets()+[{}, {'kh':0,'phi':0,'kv':.1},{'phi':5,'kh':.5},{'surcharge':10000},{'allowable_bearing':500,'ultimate_bearing':1500,'bearing_source':'試算來源'}, {'foundation':'rock','kv':.3}]
        for i in range(120):
            bottom=rng.uniform(.2,1.8)
            cases.append(dict(height=rng.uniform(.6,8),base_thickness=rng.uniform(.2,.9),toe=rng.uniform(0,2),heel=rng.uniform(0,4),stem_bottom=bottom,stem_top=rng.uniform(.1,bottom),phi=rng.uniform(10,48),friction=rng.uniform(.1,.9),surcharge=rng.uniform(0,80),kh=rng.uniform(0,.45),kv=rng.uniform(0,.2),allowable_bearing=rng.uniform(50,500),ultimate_bearing=rng.uniform(100,1800),bearing_source='case '+str(i),foundation='rock' if i%2 else 'soil'))
        output=json.loads(subprocess.check_output(['node','tests/browser_harness.mjs'],input=json.dumps(cases).encode(),cwd=ROOT))
        self.compare(presets(),output['presets'])
        for i,(w,item) in enumerate(zip(cases,output['results'])):
            with self.subTest(case=i):self.compare(analyze(w),item['result'])

    def test_rejected_inputs_match(self):
        cases=[None,[],{'extra':1},{'height':None},{'height':True},{'height':'2'},{'height':-1},{'height':1e300},{'surcharge':1e300},{'toe':-1},{'phi':50},{'kh':.6},{'kv':.5},{'stem_top':2},{'groundwater_height':1},{'backfill_slope':1},{'cohesion':1},{'wall_friction':1},{'name':''},{'foundation':'unknown'},{'allowable_bearing':0}]
        output=json.loads(subprocess.check_output(['node','tests/browser_harness.mjs'],input=json.dumps(cases).encode(),cwd=ROOT))
        for w,item in zip(cases,output['results']):
            with self.subTest(input=w),self.assertRaises(ValueError) as e:analyze(w)
            self.assertEqual(str(e.exception),item['error'])
