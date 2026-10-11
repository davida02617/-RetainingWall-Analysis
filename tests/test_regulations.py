"""Independent reference calculations for the reviewed Taiwan model."""
import unittest
from dataclasses import asdict
from retaining_wall.core import Wall, analyze, analyze_case, check, envelope

class RegulationTests(unittest.TestCase):
    def test_strict_boundary_without_rounding(self):
        self.assertEqual(check(3,3,strict=True)['status'],'fail')
        self.assertEqual(check(3,3)['status'],'pass')
        self.assertEqual(check(3.000000001,3,strict=True)['status'],'pass')
        self.assertEqual(check(2.999999999,3)['status'],'fail')

    def test_profiles_and_seismic_bearing_limits(self):
        for profile,limit,op in [('swc',3,'≥'),('building',2,'>'),('both',3,'≥')]:
            with self.subTest(profile=profile):
                r=analyze({'regulation':profile})
                self.assertEqual(r['seismic'][0]['checks']['bearing_fs']['limit'],limit)
                self.assertEqual(r['seismic'][0]['checks']['bearing_fs']['operator'],op)
                self.assertEqual(r['static']['checks']['bearing_fs']['limit'],3)

    def test_unconfirmed_never_passes(self):
        r=analyze({'allowable_bearing':1000,'ultimate_bearing':5000,'bearing_source':'source'})
        self.assertNotIn('pass',[v['status'] for v in r['static']['checks'].values()])
        self.assertEqual(r['overall_status'],'incomplete')

    def test_building_uses_net_capacity(self):
        c=analyze_case(Wall(regulation='building',overburden_pressure=10,ultimate_bearing=700))
        q=c['pressure']['qmax']
        self.assertAlmostEqual(c['checks']['bearing_fs']['value'],690/(q-10))
        self.assertAlmostEqual(c['bearing']['fs_gross'],700/q)
        self.assertEqual(analyze({'regulation':'building','ultimate_bearing':700})['static']['checks']['bearing_fs']['status'],'pending')

    def test_seismic_capacity_does_not_automatically_increase(self):
        w=Wall(allowable_bearing=100,ultimate_bearing=350)
        c=analyze_case(w,True)
        self.assertEqual(c['bearing']['qa'],100)
        self.assertEqual(c['bearing']['qult'],350)
        w.allowable_bearing_seismic=140;w.ultimate_bearing_seismic=300
        c=analyze_case(w,True)
        self.assertEqual(c['bearing']['qa'],140)
        self.assertEqual(c['bearing']['qult'],300)

    def test_rotation_moment_follows_112_code(self):
        c=analyze_case(Wall(),True)
        h=c['earth_height'];pa=c['static_earth_force'];delta=c['delta_earth_force']
        mi=sum(v['weight']*.15*v['y'] for v in c['loads'])
        self.assertAlmostEqual(c['overturning_moment'],pa*h/3+delta*2*h/3+mi)
        self.assertEqual(c['delta_height_ratio'],2/3)

    def test_other_displacement_modes(self):
        for mode,ya,yd in [('translation',.42,.48),('top_rotation',.55,.55)]:
            c=analyze_case(Wall(movement=mode),True)
            expected=(c['static_earth_force']*ya+c['delta_earth_force']*yd)*c['earth_height']/c['earth_force']
            self.assertAlmostEqual(c['earth_application_height'],expected)

    def test_surcharge_weight_and_inertia(self):
        w=Wall(surcharge=20,kv=.1)
        a=analyze_case(w,True,.1);b=analyze_case(w,True,.1,'full')
        self.assertAlmostEqual(b['normal']-a['normal'],20*1.7*.9)
        self.assertAlmostEqual(b['inertia_force']-a['inertia_force'],20*1.7*.15)
        self.assertAlmostEqual(a['surcharge_force'],a['kae']*20*3.3*.9)
        n=analyze_case(w,True,.1,'none')
        self.assertEqual(n['surcharge_force'],0)
        r=analyze(asdict(w))
        self.assertEqual(len(r['additional_cases']),6)
        self.assertEqual(len({c['id'] for c in [r['static'],*r['seismic'],*r['additional_cases']]}),9)

    def test_envelope_uses_relative_limit(self):
        # Smaller raw seismic FS is acceptable; the static case actually fails.
        r=analyze({'regulation':'building','ultimate_bearing':800,'overburden_pressure':0})
        a=r['static'];b=r['seismic'][0]
        a['checks']['bearing_fs']=check(2.9,3,strict=True)
        b['checks']['bearing_fs']=check(2.1,2,strict=True)
        e=envelope([a,b])['bearing_fs']
        self.assertEqual(e['case_id'],a['id']);self.assertEqual(e['status'],'fail')

    def test_no_solution_not_hidden_by_envelope(self):
        r=analyze({'phi':5,'kh':.5,'friction':1})
        self.assertEqual(r['envelope']['sliding']['status'],'unsupported')
        self.assertEqual(r['envelope']['sliding']['case_id'],r['seismic'][0]['id'])

    def test_exposed_height_is_not_total_height(self):
        r=analyze({'regulation':'swc','wall_type':'gravity','height':5,'exposed_height':3.9})
        self.assertEqual(r['height_review']['status'],'pass')
        r=analyze({'regulation':'swc','wall_type':'gravity','height':5,'exposed_height':4.1})
        self.assertEqual(r['height_review']['status'],'pending')

    def test_building_rock_not_assigned_swc_eccentricity(self):
        a=analyze({'regulation':'swc','foundation':'rock'})['static']
        b=analyze({'regulation':'building','foundation':'rock'})['static']
        self.assertAlmostEqual(a['checks']['eccentricity']['limit'],a['width']/4)
        self.assertAlmostEqual(b['checks']['eccentricity']['limit'],b['width']/6)
        self.assertIn('本模型',b['checks']['eccentricity']['basis'])

    def test_complete_design_always_requires_remaining_work(self):
        r=analyze({'regulation':'building','allowable_bearing':1000,'ultimate_bearing':5000,'overburden_pressure':0,'bearing_source':'r','design_basis':'d','soil_source':'s','model_source':'m','seismic_source':'e'})
        self.assertEqual(r['overall_status'],'incomplete')
        self.assertEqual(len(r['outstanding']),6)
        self.assertTrue(all(v['status']=='pending' for v in r['outstanding']))
