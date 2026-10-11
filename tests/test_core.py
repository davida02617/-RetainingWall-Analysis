import unittest
from dataclasses import asdict
from retaining_wall.core import Wall, analyze, analyze_case, contact, coefficient, centroid

class CoreTests(unittest.TestCase):
    def test_rankine_reference(self):
        self.assertAlmostEqual(coefficient(30), 1/3)
        self.assertAlmostEqual(coefficient(0), 1)
        self.assertAlmostEqual(coefficient(0, 0, .1), 1)
        self.assertAlmostEqual(coefficient(30, 0, 0), coefficient(30))

    def test_independent_rectangle_handcalculation(self):
        # B=3,Hearth=3.5; base W=36,stem W=36,heel soil W=81.
        w=Wall(height=3,base_thickness=.5,toe=1,heel=1.5,stem_bottom=.5,stem_top=.5,kh=0)
        c=analyze_case(w)
        n=36+36+81
        mr=36*1.5+36*1.25+81*2.25
        pa=.5*(1/3)*18*3.5**2
        mo=pa*3.5/3
        self.assertAlmostEqual(c['normal'],n)
        self.assertAlmostEqual(c['resisting_moment'],mr)
        self.assertAlmostEqual(c['earth_force'],pa)
        self.assertAlmostEqual(c['overturning_moment'],mo)
        self.assertAlmostEqual(c['checks']['overturning']['value'],mr/mo)
        self.assertAlmostEqual(c['checks']['sliding']['value'],.5*n/pa)
        self.assertAlmostEqual(c['resultant_x'],(mr-mo)/n)

    def test_polygon_centroid(self):
        area,x,y=centroid([(0,0),(2,0),(2,3),(1,3)])
        # Rectangle area 3 @x1.5 plus triangle area1.5 @x2/3.
        self.assertAlmostEqual(area,4.5)
        self.assertAlmostEqual(x,(3*1.5+1.5*2/3)/4.5)
        self.assertAlmostEqual(y,(3*1.5+1.5*1)/4.5)

    def test_contact_models_and_equilibrium(self):
        c=contact(120,3,1.5)
        self.assertEqual(c['mode'],'full');self.assertEqual(c['qmax'],40)
        c=contact(120,3,.3)
        self.assertEqual(c['mode'],'partial')
        self.assertAlmostEqual(.5*c['qmax']*c['contact_width'],120)
        self.assertAlmostEqual(c['contact_width']/3,.3)
        self.assertEqual(contact(120,3,0)['mode'],'unstable')
        self.assertEqual(contact(-1,3,1)['mode'],'unstable')
        self.assertEqual(contact(120,3,1)['mode'],'full')
        self.assertAlmostEqual(contact(120,3,2.7)['qmax'],contact(120,3,.3)['qmax'])

    def test_seismic_zero_matches_static(self):
        r=analyze(asdict(Wall(kh=0)))
        for k in ('earth_force','normal','resisting_moment','overturning_moment'):
            self.assertAlmostEqual(r['static'][k],r['seismic'][0][k])

    def test_seismic_inertia_and_vertical_envelope(self):
        w=Wall(kh=.15,kv=.05)
        r=analyze(asdict(w))
        self.assertEqual([v['kv'] for v in r['seismic']],[-.05,.05])
        for c in r['seismic']:
            self.assertAlmostEqual(c['inertia_force'],sum(v['weight'] for v in c['loads'])*.15)
            self.assertAlmostEqual(c['normal'],r['static']['normal']*(1-c['kv']))
            self.assertGreater(c['earth_force'],r['static']['earth_force'])

    def test_water_and_nonfinite_rejected(self):
        for k,v in [('groundwater_height',1),('backfill_slope',1),('cohesion',1),('wall_friction',1),('height',float('nan')),('toe',-1),('height',True),('height','3'),('height',1e308),('surcharge',1e308)]:
            with self.subTest(k=k),self.assertRaises(ValueError):
                analyze({k:v})
        with self.assertRaises(ValueError):analyze({'misspelled':2})

    def test_no_seismic_solution_does_not_hide_static(self):
        r=analyze({'phi':5,'kh':.5})
        self.assertIn('checks',r['static'])
        self.assertEqual(r['seismic'][0]['status'],'unsupported')

    def test_bearing_missing_not_pass(self):
        r=analyze({})
        self.assertEqual(r['static']['checks']['bearing_fs']['status'],'pending')
        self.assertEqual(r['rc']['status'],'pending')
        self.assertEqual(r['overall_status'],'incomplete')

    def test_bearing_requires_source_and_separate_values(self):
        r=analyze({'allowable_bearing':500,'ultimate_bearing':1500})
        self.assertEqual(r['static']['checks']['bearing_allowable']['status'],'pending')
        r=analyze({'allowable_bearing':500,'ultimate_bearing':1500,'bearing_source':'測試報告 p.10'})
        self.assertEqual(r['static']['checks']['bearing_allowable']['status'],'pass')
        self.assertAlmostEqual(r['static']['checks']['bearing_fs']['value'],1500/r['static']['pressure']['qmax'])
        r=analyze({'allowable_bearing':1,'bearing_source':'測試報告'})
        self.assertEqual(r['static']['checks']['bearing_allowable']['status'],'fail')

    def test_surcharge_does_not_credit_stabilizing_weight(self):
        a=analyze_case(Wall());b=analyze_case(Wall(surcharge=10))
        self.assertEqual(a['normal'],b['normal'])
        self.assertAlmostEqual(b['surcharge_force'],(1/3)*10*3.3)
        self.assertGreater(b['overturning_moment'],a['overturning_moment'])

if __name__=='__main__':unittest.main()
