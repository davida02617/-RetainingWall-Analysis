"""Dry, horizontal, cohesionless backfill; forces per metre of wall."""
from dataclasses import dataclass, asdict, fields
from math import radians, tan, sin, cos, sqrt, atan2, isfinite

from .regulations import PROFILES, MOVEMENTS, LOAD_CASES, REFERENCES, REVIEW_DATE, ASSUMPTIONS, OUTSTANDING

VERSION = '0.3.0'
SOURCE = 'https://law.moa.gov.tw/LawContent.aspx?id=FL014521'

@dataclass
class Wall:
    name: str = 'R2 懸臂式擋土牆'
    wall_type: str = 'cantilever'
    height: float = 2.8
    base_thickness: float = 0.5
    toe: float = 0.5
    heel: float = 1.7
    stem_top: float = 0.25
    stem_bottom: float = 0.5
    gamma_concrete: float = 24.0
    gamma_soil: float = 18.0
    phi: float = 30.0
    friction: float = 0.5
    surcharge: float = 0.0
    kh: float = 0.15
    kv: float = 0.0
    allowable_bearing: float | None = None
    ultimate_bearing: float | None = None
    bearing_source: str = ''
    foundation: str = 'soil'
    regulation: str = 'unconfirmed'
    design_basis: str = ''
    soil_source: str = ''
    seismic_source: str = ''
    model_source: str = ''
    load_source: str = ''
    movement: str = 'toe_rotation'
    exposed_height: float | None = None
    overburden_pressure: float | None = None
    allowable_bearing_seismic: float | None = None
    ultimate_bearing_seismic: float | None = None
    groundwater_height: float = 0.0
    backfill_slope: float = 0.0
    cohesion: float = 0.0
    wall_friction: float = 0.0

    @classmethod
    def parse(cls, data):
        if not isinstance(data, dict):
            raise ValueError('斷面必須是 JSON 物件')
        unknown = set(data) - {f.name for f in fields(cls)}
        if unknown:
            raise ValueError('未知參數：' + ', '.join(sorted(unknown)))
        w = cls(**data)
        for f in fields(cls):
            v = getattr(w, f.name)
            if f.name in ('name', 'wall_type', 'foundation', 'bearing_source', 'regulation', 'design_basis', 'soil_source', 'seismic_source', 'model_source', 'load_source', 'movement'):
                if not isinstance(v, str) or len(v) > 200:
                    raise ValueError(f'{f.name} 必須為 200 字內文字')
            elif v is None and f.name in ('allowable_bearing', 'ultimate_bearing', 'allowable_bearing_seismic', 'ultimate_bearing_seismic', 'overburden_pressure', 'exposed_height'):
                continue
            elif isinstance(v, bool) or not isinstance(v, (int, float)) or not isfinite(v):
                raise ValueError(f'{f.name} 必須為有限數值')
        for key in ('height', 'base_thickness', 'toe', 'heel', 'stem_top', 'stem_bottom'):
            if abs(getattr(w, key)) > 100:
                raise ValueError(f'{key} 超過本版 100 m 分析範圍')
        for key in ('gamma_concrete', 'gamma_soil'):
            if getattr(w, key) > 50:
                raise ValueError(f'{key} 超過本版 50 kN/m³ 範圍')
        for key in ('surcharge', 'allowable_bearing', 'ultimate_bearing', 'allowable_bearing_seismic', 'ultimate_bearing_seismic', 'overburden_pressure'):
            if getattr(w, key) is not None and abs(getattr(w, key)) > 1e6:
                raise ValueError(f'{key} 超過本版 1e6 kPa 範圍')
        if not w.name.strip():
            raise ValueError('斷面名稱不得空白')
        if w.wall_type not in ('cantilever', 'gravity') or w.foundation not in ('soil', 'rock'):
            raise ValueError('不支援的牆型或基礎種類')
        if w.regulation not in PROFILES or w.movement not in MOVEMENTS:
            raise ValueError('不支援的法規或位移模式')
        if w.exposed_height is not None and not 0 < w.exposed_height <= w.height + w.base_thickness:
            raise ValueError('有效露出高度須大於零且不得超過斷面總高')
        if w.overburden_pressure is not None and w.overburden_pressure < 0:
            raise ValueError('開挖前覆土壓力不得為負')
        for key in ('ultimate_bearing', 'ultimate_bearing_seismic'):
            if getattr(w, key) is not None and w.overburden_pressure is not None and getattr(w, key) <= w.overburden_pressure:
                raise ValueError('gross 極限承載力須大於開挖前覆土壓力')
        for key in ('height', 'base_thickness', 'stem_top', 'stem_bottom', 'gamma_concrete', 'gamma_soil'):
            if getattr(w, key) <= 0:
                raise ValueError(f'{key} 必須大於零')
        if min(w.toe, w.heel, w.surcharge) < 0 or w.stem_top > w.stem_bottom:
            raise ValueError('趾、踵、載重不得為負；牆頂厚不得超過牆底厚')
        if not 0 <= w.phi < 50 or not 0 <= w.friction <= 1 or not 0 <= w.kh <= 0.5 or not 0 <= w.kv < 0.5:
            raise ValueError('φ 需為 0–<50°、μ 為 0–1、kh 為 0–0.5、|kv| 為 0–<0.5')
        for key in ('allowable_bearing', 'ultimate_bearing', 'allowable_bearing_seismic', 'ultimate_bearing_seismic'):
            if getattr(w, key) is not None and getattr(w, key) <= 0:
                raise ValueError(f'{key} 必須大於零或留空')
        for key in ('groundwater_height', 'backfill_slope', 'cohesion', 'wall_friction'):
            if getattr(w, key) != 0:
                raise ValueError(f'本版未支援 {key} 非零；不得以乾土模式代算')
        return w


def coefficient(phi, kh=0.0, kv=0.0):
    """M–O restricted to vertical smooth wall and level dry backfill."""
    p = radians(phi)
    if kh == 0:
        return tan(radians(45) - p / 2) ** 2
    theta = atan2(kh, 1 - kv)
    if theta >= p:
        raise ValueError('地震 θ ≥ φ，Mononobe–Okabe 無可用解')
    return cos(p - theta) ** 2 / (cos(theta) ** 2 * (1 + sqrt(sin(p) * sin(p - theta) / cos(theta))) ** 2)


def centroid(points):
    cross = [x * v - u * y for (x, y), (u, v) in zip(points, points[1:] + points[:1])]
    area2 = sum(cross)
    if abs(area2) < 1e-12:
        raise ValueError('退化斷面')
    cx = sum((points[i][0] + points[(i+1) % len(points)][0]) * c for i, c in enumerate(cross)) / (3 * area2)
    cy = sum((points[i][1] + points[(i+1) % len(points)][1]) * c for i, c in enumerate(cross)) / (3 * area2)
    return abs(area2) / 2, cx, cy


def contact(normal, width, resultant):
    if normal <= 0 or not 0 < resultant < width:
        return {'mode': 'unstable', 'qmax': None, 'qmin': None, 'contact_width': 0.0}
    e = width / 2 - resultant
    if abs(e) <= width / 6 + 1e-12:
        return {'mode': 'full', 'qmax': normal / width * (1 + 6 * abs(e) / width),
                'qmin': max(0.0, normal / width * (1 - 6 * abs(e) / width)), 'contact_width': width}
    b = 3 * min(resultant, width - resultant)
    return {'mode': 'partial', 'qmax': 2 * normal / b, 'qmin': 0.0, 'contact_width': b}


def check(value, limit, upper=False, strict=False, basis=''):
    ok = value is not None and limit is not None and (value <= limit if upper else value > limit if strict else value >= limit)
    return {'value': value, 'limit': limit, 'operator': '≤' if upper else '>' if strict else '≥',
            'basis': basis, 'status': 'pending' if value is None or limit is None else 'pass' if ok else 'fail'}


def case_id(seismic, kv, loading):
    return ('E' if seismic else 'S') + ':' + ('positive' if kv > 0 else 'negative' if kv < 0 else 'zero') + ':' + loading


def analyze_case(w, seismic=False, kv=0.0, loading='lateral_only'):
    h, t = w.height, w.base_thickness
    b = w.toe + w.stem_bottom + w.heel
    rear = w.toe + w.stem_bottom
    polygon = [(w.toe, t), (rear, t), (rear, t+h), (rear-w.stem_top, t+h)]
    area, cx, cy = centroid(polygon)
    loads = [dict(name='底版', weight=b*t*w.gamma_concrete, x=b/2, y=t/2),
             dict(name='牆身', weight=area*w.gamma_concrete, x=cx, y=cy),
             dict(name='踵上背填土', weight=w.heel*h*w.gamma_soil, x=rear+w.heel/2, y=t+h/2)]
    earth_h = h + t
    q = 0.0 if loading == 'none' else w.surcharge
    if loading == 'full':
        loads.append(dict(name='踵上均佈載重', weight=q*w.heel, x=rear+w.heel/2, y=earth_h))
    kh = w.kh if seismic else 0.0
    k = coefficient(w.phi, kh, kv)
    ka = coefficient(w.phi)
    pa = .5*ka*w.gamma_soil*earth_h**2
    total = .5*k*w.gamma_soil*earth_h**2*(1-kv)
    delta = total - pa
    pq = k*q*earth_h*(1-kv)
    if not seismic or (kh == 0 and kv == 0):
        ya, yd = 1/3, 1/3
    else:
        ya, yd = {'toe_rotation': (1/3, 2/3), 'translation': (.42, .48), 'top_rotation': (.55, .55)}[w.movement]
    soil_moment = (pa*ya + delta*yd)*earth_h
    earth_y = soil_moment/total
    if not 0 <= earth_y <= earth_h:
        raise ValueError('地震土壓合力作用點超出牆高；此增量分配模型不適用')
    moment_earth = soil_moment + pq*earth_h/2
    inertial_h = sum(v['weight'] for v in loads)*kh
    moment_inertia = sum(v['weight']*kh*v['y'] for v in loads)
    n = sum(v['weight'] for v in loads)*(1-kv)
    mr = sum(v['weight']*v['x'] for v in loads)*(1-kv)
    mo = moment_earth + moment_inertia
    horizontal = total + pq + inertial_h
    x = (mr-mo)/n
    e = b/2-x
    pressure = contact(n, b, x)
    qmax = pressure['qmax']
    building = w.regulation in ('building', 'both')
    swc = w.regulation in ('swc', 'both', 'unconfirmed')
    bearing_limit = 2.0 if seismic and w.regulation == 'building' else 3.0
    bearing_strict = building and not (seismic and w.regulation == 'both')
    qa = w.allowable_bearing_seismic if seismic and w.allowable_bearing_seismic is not None else w.allowable_bearing
    qult = w.ultimate_bearing_seismic if seismic and w.ultimate_bearing_seismic is not None else w.ultimate_bearing
    q0 = w.overburden_pressure
    fs_gross = qult/qmax if qult is not None and qmax else None
    fs_net = (qult-q0)/(qmax-q0) if qult is not None and q0 is not None and qmax is not None and qmax > q0 else None
    # SWC does not specify a net conversion: retain its gross comparison as well.
    fs_bearing = min(fs_gross, fs_net) if w.regulation == 'both' and fs_net is not None else fs_net if building else fs_gross
    legal_basis = '水保 §120；基礎規範 §7.4' if w.regulation == 'both' else '基礎規範 §7.4' if building else '水保 §120'
    e_limit = b/(4 if swc and not building and w.foundation == 'rock' else 6)
    checks = {
        'overturning': check(mr/mo if mo > 0 else None, 1.5 if seismic else 2.0, strict=building, basis=legal_basis),
        'sliding': check(w.friction*n/horizontal if horizontal > 0 else None, 1.2 if seismic else 1.5, strict=building, basis=legal_basis),
        'eccentricity': check(abs(e), e_limit, True, basis='水保 §120' if swc and not building else '本模型採 B/6 不受拉條件' + ('；並滿足水保 §120' if swc else '')),
        'bearing_allowable': check(qmax, qa, True, basis='使用者地勘 gross qa；建築構造編 §121-3／水保 §120'),
        'bearing_fs': check(fs_bearing, bearing_limit, strict=bearing_strict, basis=legal_basis + ('；淨值依 §4.3.5' if building else '；gross 比值')),
    }
    if pressure['mode'] == 'unstable':
        for key in ('bearing_allowable', 'bearing_fs'):
            checks[key]['status'] = 'fail'
    if not w.bearing_source.strip():
        for key in ('bearing_allowable', 'bearing_fs'):
            if checks[key]['status'] == 'pass':
                checks[key]['status'] = 'pending'
    if w.regulation == 'unconfirmed':
        for item in checks.values():
            if item['status'] == 'pass':
                item['status'] = 'pending'
    missing = [label for value, label in [(w.design_basis, '案件法規適用依據'), (w.soil_source, '土壤與摩擦參數來源'),
               (w.model_source, '乾土及主動位移條件依據')] if not value.strip()]
    if seismic and not w.seismic_source.strip():
        missing.append('工址地震參數來源')
    if w.surcharge > 0 and not w.load_source.strip():
        missing.append('載重性質與組合依據')
    statuses = [v['status'] for v in checks.values()]
    status = 'fail' if 'fail' in statuses else 'pending' if 'pending' in statuses or missing else 'pass'
    return {'case': 'seismic' if seismic else 'static', 'kv': kv, 'id': case_id(seismic, kv, loading),
            'loading': loading, 'status': status, 'checks': checks, 'missing': missing,
            'width': b, 'earth_height': earth_h, 'earth_application_height': earth_y,
            'static_height_ratio': ya, 'delta_height_ratio': yd, 'ka': ka, 'kae': k, 'normal': n,
            'earth_force': total, 'static_earth_force': pa, 'delta_earth_force': delta,
            'surcharge_force': pq, 'inertia_force': inertial_h, 'horizontal': horizontal,
            'resisting_moment': mr, 'overturning_moment': mo, 'resultant_x': x, 'eccentricity': e,
            'bearing': {'qa': qa, 'qult': qult, 'q0': q0, 'fs_gross': fs_gross, 'fs_net': fs_net},
            'pressure': pressure, 'loads': loads, 'stem_polygon': polygon}


def envelope(cases):
    result = {}
    for key in ('overturning', 'sliding', 'eccentricity', 'bearing_allowable', 'bearing_fs'):
        valid = [c for c in cases if 'checks' in c and c['checks'][key]['value'] is not None]
        upper = key in ('eccentricity', 'bearing_allowable')
        def ratio(c):
            item = c['checks'][key]
            return item['value']/item['limit'] if item['limit'] else item['value']
        governing = (max if upper else min)(valid, key=ratio) if valid else None
        unresolved = [c for c in cases if 'checks' not in c or c['checks'][key]['status'] == 'fail' and c['checks'][key]['value'] is None]
        failed = [c for c in cases if 'checks' in c and c['checks'][key]['status'] == 'fail']
        invalid_failed = [c for c in failed if c['checks'][key]['value'] is None]
        if invalid_failed:
            governing = invalid_failed[0]
        elif unresolved and not failed:
            governing = unresolved[0]
        statuses = [c['checks'][key]['status'] if 'checks' in c else 'unsupported' for c in cases]
        status = 'fail' if 'fail' in statuses else 'unsupported' if 'unsupported' in statuses else 'pending' if 'pending' in statuses else 'pass'
        result[key] = dict(value=governing['checks'][key]['value'] if governing and 'checks' in governing else None,
                           case_id=governing['id'] if governing else None, status=status)
    return result


def analyze(data):
    w = Wall.parse(data)
    def run(seismic=False, kv=0.0, loading='lateral_only'):
        try:
            return analyze_case(w, seismic, kv, loading)
        except ValueError as exc:
            return {'case': 'seismic' if seismic else 'static', 'kv': kv, 'loading': loading,
                    'id': case_id(seismic, kv, loading), 'status': 'unsupported', 'error': str(exc)}
    static = run()
    directions = sorted({w.kv, -w.kv})
    seismic = [run(True, kv) for kv in directions]
    additional = []
    if w.surcharge > 0:
        for loading in (['none', 'full'] if w.heel > 0 else ['none']):
            additional.append(run(loading=loading))
            additional.extend(run(True, kv, loading) for kv in directions)
    cases = [static, *seismic, *additional]
    height_limit = 4 if w.wall_type == 'gravity' else 8
    height_review = {'status': 'pending', 'value': w.exposed_height, 'limit': height_limit if w.regulation in ('swc', 'both') else None,
                     'reason': '水保 §118 以有效露出高度為準；超過原則高度需專業技師安全分析。' if w.regulation in ('swc', 'both') else '高度適用條件由案件確認。'}
    if w.regulation in ('swc', 'both') and w.exposed_height is not None:
        height_review['status'] = 'pass' if w.exposed_height <= height_limit else 'pending'
    return {'engine_version': VERSION, 'input': asdict(w), 'static': static, 'seismic': seismic,
            'additional_cases': additional, 'envelope': envelope(cases), 'height_review': height_review,
            'regulation': {'id': w.regulation, 'name': PROFILES[w.regulation], 'review_date': REVIEW_DATE},
            'references': REFERENCES, 'outstanding': [dict(v, status='pending') for v in OUTSTANDING],
            'rc': {'status': 'pending', 'reason': '牆身／底版強度、材料應力、配筋、裂縫及錨定尚未檢核'},
            'overall_status': 'incomplete', 'source': SOURCE, 'assumptions': ASSUMPTIONS}


def presets():
    r1 = asdict(Wall(name='R1 懸臂式擋土牆', height=2.3, base_thickness=.4, toe=.4, heel=1.3, stem_bottom=.4))
    r2 = asdict(Wall())
    r3 = asdict(Wall(name='R3 重力式擋土牆', wall_type='gravity', height=1.3, base_thickness=.3, toe=.15, heel=0, stem_bottom=.95, stem_top=.35))
    return [r1, r2, r3]
