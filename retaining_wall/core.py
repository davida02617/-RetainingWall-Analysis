"""Dry, horizontal, cohesionless backfill; forces per metre of wall."""
from dataclasses import dataclass, asdict, fields
from math import radians, tan, sin, cos, sqrt, atan2, isfinite

VERSION = '0.1.0'
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
            if f.name in ('name', 'wall_type', 'foundation', 'bearing_source'):
                if not isinstance(v, str) or len(v) > 200:
                    raise ValueError(f'{f.name} 必須為 200 字內文字')
            elif v is None and f.name in ('allowable_bearing', 'ultimate_bearing'):
                continue
            elif isinstance(v, bool) or not isinstance(v, (int, float)) or not isfinite(v):
                raise ValueError(f'{f.name} 必須為有限數值')
        for key in ('height', 'base_thickness', 'toe', 'heel', 'stem_top', 'stem_bottom'):
            if abs(getattr(w, key)) > 100:
                raise ValueError(f'{key} 超過本版 100 m 分析範圍')
        for key in ('gamma_concrete', 'gamma_soil'):
            if getattr(w, key) > 50:
                raise ValueError(f'{key} 超過本版 50 kN/m³ 範圍')
        for key in ('surcharge', 'allowable_bearing', 'ultimate_bearing'):
            if getattr(w, key) is not None and abs(getattr(w, key)) > 1e6:
                raise ValueError(f'{key} 超過本版 1e6 kPa 範圍')
        if not w.name.strip():
            raise ValueError('斷面名稱不得空白')
        if w.wall_type not in ('cantilever', 'gravity') or w.foundation not in ('soil', 'rock'):
            raise ValueError('不支援的牆型或基礎種類')
        for key in ('height', 'base_thickness', 'stem_top', 'stem_bottom', 'gamma_concrete', 'gamma_soil'):
            if getattr(w, key) <= 0:
                raise ValueError(f'{key} 必須大於零')
        if min(w.toe, w.heel, w.surcharge) < 0 or w.stem_top > w.stem_bottom:
            raise ValueError('趾、踵、載重不得為負；牆頂厚不得超過牆底厚')
        if not 0 <= w.phi < 50 or not 0 <= w.friction <= 1 or not 0 <= w.kh <= 0.5 or not 0 <= w.kv < 0.5:
            raise ValueError('φ 需為 0–<50°、μ 為 0–1、kh 為 0–0.5、|kv| 為 0–<0.5')
        for key in ('allowable_bearing', 'ultimate_bearing'):
            if getattr(w, key) is not None and getattr(w, key) <= 0:
                raise ValueError(f'{key} 必須大於零或留空')
        for key in ('groundwater_height', 'backfill_slope', 'cohesion', 'wall_friction'):
            if getattr(w, key) != 0:
                raise ValueError(f'V0.1 未支援 {key} 非零；不得以乾土模式代算')
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


def check(value, limit, upper=False):
    return {'value': value, 'limit': limit, 'status': 'pending' if value is None else ('pass' if (value <= limit if upper else value >= limit) else 'fail')}


def analyze_case(w, seismic=False, kv=0.0):
    h, t = w.height, w.base_thickness
    b = w.toe + w.stem_bottom + w.heel
    rear = w.toe + w.stem_bottom
    polygon = [(w.toe, t), (rear, t), (rear, t+h), (rear-w.stem_top, t+h)]
    area, cx, cy = centroid(polygon)
    loads = [dict(name='底版', weight=b*t*w.gamma_concrete, x=b/2, y=t/2),
             dict(name='牆身', weight=area*w.gamma_concrete, x=cx, y=cy),
             dict(name='踵上背填土', weight=w.heel*h*w.gamma_soil, x=rear+w.heel/2, y=t+h/2)]
    # Virtual vertical back at heel edge, from foundation underside to ground.
    earth_h = h + t
    kh = w.kh if seismic else 0.0
    k = coefficient(w.phi, kh, kv)
    ka = coefficient(w.phi)
    pa = .5*ka*w.gamma_soil*earth_h**2
    total = .5*k*w.gamma_soil*earth_h**2*(1-kv)
    # Explicit modelling choice: static triangle plus delta at user-visible 0.6H.
    delta = total - pa
    pq = k*w.surcharge*earth_h
    moment_earth = pa*earth_h/3 + delta*.6*earth_h + pq*earth_h/2
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
    checks = {
        'overturning': check(mr/mo if mo > 0 else None, 1.5 if seismic else 2.0),
        'sliding': check(w.friction*n/horizontal if horizontal > 0 else None, 1.2 if seismic else 1.5),
        'eccentricity': check(abs(e), b/(4 if w.foundation == 'rock' else 6), True),
        'bearing_allowable': check(qmax, w.allowable_bearing, True) if w.allowable_bearing is not None else check(None, None),
        'bearing_fs': check(w.ultimate_bearing/qmax if w.ultimate_bearing is not None and qmax else None, 3.0),
    }
    if pressure['mode'] == 'unstable':
        checks['bearing_allowable']['status'] = 'fail'
        checks['bearing_fs']['status'] = 'fail'
    if not w.bearing_source.strip():
        for key in ('bearing_allowable', 'bearing_fs'):
            if checks[key]['status'] == 'pass':
                checks[key]['status'] = 'pending'
    statuses = [v['status'] for v in checks.values()]
    status = 'fail' if 'fail' in statuses else ('pending' if 'pending' in statuses else 'pass')
    return {'case': 'seismic' if seismic else 'static', 'kv': kv, 'status': status, 'checks': checks,
            'width': b, 'earth_height': earth_h, 'ka': ka, 'kae': k, 'normal': n,
            'earth_force': total, 'static_earth_force': pa, 'delta_earth_force': delta,
            'surcharge_force': pq, 'inertia_force': inertial_h, 'horizontal': horizontal,
            'resisting_moment': mr, 'overturning_moment': mo, 'resultant_x': x, 'eccentricity': e,
            'pressure': pressure, 'loads': loads, 'stem_polygon': polygon}


def analyze(data):
    w = Wall.parse(data)
    static = analyze_case(w)
    seismic = []
    for kv in sorted({w.kv, -w.kv}):
        try:
            seismic.append(analyze_case(w, True, kv))
        except ValueError as exc:
            seismic.append({'case': 'seismic', 'kv': kv, 'status': 'unsupported', 'error': str(exc)})
    return {'engine_version': VERSION, 'input': asdict(w), 'static': static, 'seismic': seismic,
            'rc': {'status': 'pending', 'reason': '尚未實作牆身／底版強度、配筋、裂縫及錨定檢核'},
            'overall_status': 'incomplete', 'source': SOURCE,
            'assumptions': ['每延米，m／kN／kPa；乾燥均質無凝聚土、水平填土、垂直光滑虛擬牆背。',
                '土壓作用面為踵端，自基底至填土頂；H土壓＝牆身高＋底版厚。',
                '不採計被動土壓、黏著及地表載重的穩定重量；地震慣性包括牆體與踵上土重。',
                '地震總土壓採限制版 M–O；常時分量作用於 H/3、增量作用於 0.6H（模型假設）。',
                '地表載重側壓採 Kae·q，未含交通動力放大；kv 正值降低重力，分析 ±|kv|。',
                'qa、qult 均由使用者提供基底 gross 值，兩工況沿用，不自動提高；缺數據或來源則待確認。',
                '部分接觸仍計算壓力；偏心距依土層 B/6、岩盤 B/4 獨立判定。',
                '未含水壓、揚壓、沉陷、整體邊坡穩定及 RC 設計；不作完整設計合格判定。']}


def presets():
    r1 = asdict(Wall(name='R1 懸臂式擋土牆', height=2.3, base_thickness=.4, toe=.4, heel=1.3, stem_bottom=.4))
    r2 = asdict(Wall())
    r3 = asdict(Wall(name='R3 重力式擋土牆', wall_type='gravity', height=1.3, base_thickness=.3, toe=.15, heel=0, stem_bottom=.95, stem_top=.35))
    return [r1, r2, r3]
