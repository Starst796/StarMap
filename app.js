(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const DEG = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;

  const canvas = $('#sky-canvas');
  const ctx = canvas.getContext('2d');
  const stage = $('#sky-stage');
  const dateInput = $('#datetime-input');
  const latitudeInput = $('#latitude-input');
  const longitudeInput = $('#longitude-input');
  const headingSlider = $('#heading-slider');
  const altitudeSlider = $('#altitude-slider');
  const objectList = $('#object-list');
  const searchInput = $('#object-search');
  const detailCard = $('#detail-card');

  const CATALOG = window.SKY_CATALOG || { stars: [], deepSky: [] };

  // ---------------------------------------------------------------- bodies ---
  const SOLAR = [
    { key: 'Sun', name: '太阳', symbol: '☉', color: '#edbf76', size: 8, kind: '恒星' },
    { key: 'Moon', name: '月球', symbol: '☾', color: '#dbe4e0', size: 7, kind: '卫星' },
    { key: 'Mercury', name: '水星', symbol: '☿', color: '#b8c7bc', size: 3, kind: '行星' },
    { key: 'Venus', name: '金星', symbol: '♀', color: '#efd19c', size: 4.5, kind: '行星' },
    { key: 'Mars', name: '火星', symbol: '♂', color: '#e48c77', size: 4, kind: '行星' },
    { key: 'Jupiter', name: '木星', symbol: '♃', color: '#e7c286', size: 5.5, kind: '行星' },
    { key: 'Saturn', name: '土星', symbol: '♄', color: '#d6c996', size: 4.5, kind: '行星' },
    { key: 'Uranus', name: '天王星', symbol: '♅', color: '#a9d7d5', size: 3.5, kind: '行星' },
    { key: 'Neptune', name: '海王星', symbol: '♆', color: '#9fb4e0', size: 3.5, kind: '行星' }
  ];

  // ------------------------------------------------------------- star data ---
  const stars = CATALOG.stars || [];
  const NS = stars.length;
  const sRa = new Float64Array(NS);
  const sDec = new Float64Array(NS);
  const sVx = new Float64Array(NS);
  const sVy = new Float64Array(NS);
  const sVz = new Float64Array(NS);
  const sAz = new Float32Array(NS);
  const sAlt = new Float32Array(NS);
  const sMag = new Float32Array(NS);
  const sSize = new Float32Array(NS);
  const sGlow = new Uint8Array(NS);
  const sLabel = new Array(NS);
  const sAlias = new Array(NS);
  const sColor = new Array(NS);

  for (let i = 0; i < NS; i += 1) {
    const row = stars[i];
    const ra = row[0];
    const dec = row[1];
    const mag = row[2];
    sRa[i] = ra;
    sDec[i] = dec;
    sMag[i] = mag;
    sLabel[i] = row[3];
    sAlias[i] = row.length > 4 ? String(row[4]).toLowerCase() : '';
    const raRad = ra * DEG;
    const decRad = dec * DEG;
    const cd = Math.cos(decRad);
    sVx[i] = cd * Math.cos(raRad);
    sVy[i] = cd * Math.sin(raRad);
    sVz[i] = Math.sin(decRad);
    sSize[i] = Math.max(0.7, 2.6 - mag * 0.32);
    sGlow[i] = mag <= 1.5 ? 1 : 0;
    const alpha = Math.min(0.97, Math.max(0.4, 0.62 + (6 - mag) * 0.07));
    sColor[i] = `rgba(221,236,220,${alpha.toFixed(2)})`;
    sAlt[i] = -90;
  }

  // --------------------------------------------------------- deep sky data ---
  const deep = CATALOG.deepSky || [];
  const ND = deep.length;
  const deepOrder = Array.from(deep.keys()).sort((a, b) => deep[a].mag - deep[b].mag);
  const dVx = new Float64Array(ND);
  const dVy = new Float64Array(ND);
  const dVz = new Float64Array(ND);
  const dAz = new Float32Array(ND);
  const dAlt = new Float32Array(ND);

  for (let i = 0; i < ND; i += 1) {
    const obj = deep[i];
    const raRad = obj.ra * DEG;
    const decRad = obj.dec * DEG;
    const cd = Math.cos(decRad);
    dVx[i] = cd * Math.cos(raRad);
    dVy[i] = cd * Math.sin(raRad);
    dVz[i] = Math.sin(decRad);
    dAlt[i] = -90;
  }

  // --------------------------------------------------- reference planes ---
  function planeVectors(points) {
    const n = points.length;
    const plane = {
      n,
      vx: new Float64Array(n),
      vy: new Float64Array(n),
      vz: new Float64Array(n),
      az: new Float32Array(n),
      alt: new Float32Array(n).fill(-90)
    };
    for (let i = 0; i < n; i += 1) {
      const ra = points[i][0] * DEG;
      const dec = points[i][1] * DEG;
      const cd = Math.cos(dec);
      plane.vx[i] = cd * Math.cos(ra);
      plane.vy[i] = cd * Math.sin(ra);
      plane.vz[i] = Math.sin(dec);
    }
    return plane;
  }

  const eclipticPlane = planeVectors(CATALOG.ecliptic || []);
  const galacticPlane = planeVectors(CATALOG.galactic || []);
  const PLANE_MAX = Math.max(eclipticPlane.n, galacticPlane.n, 1);
  const planeX = new Float32Array(PLANE_MAX);
  const planeY = new Float32Array(PLANE_MAX);
  const planeInside = new Uint8Array(PLANE_MAX);

  function resetPlanes() {
    eclipticPlane.alt.fill(-90);
    galacticPlane.alt.fill(-90);
  }

  // ----------------------------------------------------------------- state ---
  const RATES = [
    { v: 1, label: '1× 实时' },
    { v: 5, label: '5×' },
    { v: 15, label: '15×' },
    { v: 60, label: '1 分钟/秒' },
    { v: 300, label: '5 分钟/秒' },
    { v: 1800, label: '30 分钟/秒' },
    { v: 3600, label: '1 小时/秒' },
    { v: 21600, label: '6 小时/秒' },
    { v: 86400, label: '1 天/秒' }
  ];

  const state = {
    mode: 'live',
    playing: true,
    time: Date.now(),
    rateIndex: 0,
    direction: 1,
    tab: 'solar',
    query: '',
    maxMag: 12,
    showEcliptic: true,
    showGalactic: true,
    selected: null,
    invalid: true
  };

  let heading = 0;
  let zoom = 1;
  const ZOOM_MIN = 0.8;
  const ZOOM_MAX = 100;
  let sensorEnabled = false;
  let sensorHandler = null;
  const MIN_VIEW_ALT = -15;
  const BELOW_HORIZON_ALPHA = 0.34;
  const GROUND_TINT = 'rgba(7,14,16,.6)';
  let viewMode = 'zenith';
  let viewAz = 0;
  let viewAlt = 90;
  // Cached per-frame camera basis reused by project(); free mode only.
  const viewFrame = { zenith: true, headingRad: 0, Fx: 0, Fy: 0, Fz: 1, Ux: 0, Uy: 0, Uz: 1, Rx: 1, Ry: 0 };
  let solarPos = [];
  let hits = [];
  let rowRecords = [];
  let needDraw = true;
  let nextListRefresh = 0;
  let nextReadoutRefresh = 0;

  dateInput.value = toLocalInputValue(new Date(), true);
  $('#timezone-label').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || '设备本地时区';
  updatePlaybackUI();

  if (window.Astronomy) {
    $('#engine-status').textContent = `天文引擎就绪 · ${NS} 恒星`;
  } else {
    $('#engine-status').textContent = '天文引擎未载入';
    $('#sky-caption-text').textContent = '星历库未载入，请检查网络连接后刷新';
  }
  if (!NS) {
    $('#object-note').textContent = '星表未载入：恒星显示与列表不可用。';
  }

  // ------------------------------------------------------------- utilities ---
  function toLocalInputValue(date, withSeconds) {
    const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return withSeconds ? shifted.toISOString().slice(0, 19) : shifted.toISOString().slice(0, 16);
  }

  function selectedObserver() {
    if (!window.Astronomy) return null;
    const latitude = Number(latitudeInput.value);
    const longitude = Number(longitudeInput.value);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
    return new Astronomy.Observer(latitude, longitude, 0);
  }

  function cardinalName(degrees) {
    return ['北', '东北', '东', '东南', '南', '西南', '西', '西北'][Math.round(degrees / 45) % 8];
  }

  function formatAz(az) {
    return `${String(Math.round(az) % 360).padStart(3, '0')}°`;
  }

  function formatAlt(alt) {
    return `${alt >= 0 ? '+' : '−'}${Math.abs(alt).toFixed(1)}°`;
  }

  function formatRa(deg) {
    const hours = deg / 15;
    const hh = Math.floor(hours);
    const mm = (hours - hh) * 60;
    return `${String(hh).padStart(2, '0')}h ${mm.toFixed(1)}m`;
  }

  function formatDec(deg) {
    const sign = deg < 0 ? '−' : '+';
    const abs = Math.abs(deg);
    const dd = Math.floor(abs);
    const mm = (abs - dd) * 60;
    return `${sign}${String(dd).padStart(2, '0')}° ${mm.toFixed(0)}′`;
  }

  function invalidate(compute) {
    if (compute) state.invalid = true;
    needDraw = true;
  }

  /**
   * Refresh the projection basis. Zenith mode keeps the classic radial dome
   * (centre pinned to the zenith); free mode builds a first-person camera frame
   * pointing at (viewAz, viewAlt) with the zenith as screen up.
   */
  function updateViewFrame() {
    if (viewMode === 'zenith') {
      viewFrame.zenith = true;
      viewFrame.headingRad = heading * DEG;
      return;
    }
    viewFrame.zenith = false;
    const a = viewAz * DEG;
    const v = viewAlt * DEG;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const cosV = Math.cos(v);
    const sinV = Math.sin(v);
    // Forward = view centre, up = toward the zenith, right = forward x up.
    viewFrame.Fx = cosV * sinA;
    viewFrame.Fy = cosV * cosA;
    viewFrame.Fz = sinV;
    viewFrame.Ux = -sinV * sinA;
    viewFrame.Uy = -sinV * cosA;
    viewFrame.Uz = cosV;
    viewFrame.Rx = cosA;
    viewFrame.Ry = -sinA;
  }

  // ------------------------------------------------------------------ time ---
  function currentRate() {
    return RATES[state.rateIndex];
  }

  function speed() {
    return state.direction * currentRate().v;
  }

  function updatePlaybackUI() {
    const playButton = $('#play-button');
    playButton.setAttribute('aria-pressed', state.playing ? 'true' : 'false');
    $('#play-glyph').textContent = state.playing ? '❚❚' : '▶';
    $('#play-label').textContent = state.playing ? '暂停' : '播放';
    $('#rate-label').textContent = (state.direction < 0 ? '反向 · ' : '') + currentRate().label;
    $('#mode-label').textContent = state.mode === 'live'
      ? (state.playing ? '跟随实时' : '已暂停')
      : (state.playing ? '手动推进' : '已暂停');
  }

  function goLive() {
    state.mode = 'live';
    state.direction = 1;
    state.rateIndex = 0;
    state.playing = true;
    state.time = Date.now();
    updatePlaybackUI();
    invalidate(true);
  }

  function pauseTime() {
    if (state.mode === 'live') state.mode = 'manual';
    state.playing = false;
    updatePlaybackUI();
    invalidate(false);
  }

  function togglePlay() {
    if (state.playing) {
      pauseTime();
      return;
    }
    state.playing = true;
    if (state.mode === 'live') state.time = Date.now();
    updatePlaybackUI();
    invalidate(true);
  }

  function stepRate(delta) {
    if (state.mode === 'live') state.mode = 'manual';
    state.rateIndex = Math.min(RATES.length - 1, Math.max(0, state.rateIndex + delta));
    if (!state.playing) state.playing = true;
    updatePlaybackUI();
    invalidate(true);
  }

  function toggleDirection() {
    if (state.mode === 'live') state.mode = 'manual';
    state.direction *= -1;
    if (!state.playing) state.playing = true;
    updatePlaybackUI();
    invalidate(true);
  }

  // -------------------------------------------------------------- position ---
  function toAltAz(vx, vy, vz, lstDeg, sinLat, cosLat, azOut, altOut, index) {
    let ra = Math.atan2(vy, vx);
    if (ra < 0) ra += Math.PI * 2;
    const H = (lstDeg - ra * RAD2DEG) * DEG;
    const cosDec = Math.sqrt(Math.max(0, 1 - vz * vz));
    const sinAlt = vz * sinLat + cosDec * cosLat * Math.cos(H);
    const clamped = sinAlt > 1 ? 1 : (sinAlt < -1 ? -1 : sinAlt);
    altOut[index] = Math.asin(clamped) * RAD2DEG;
    // Azimuth from north, increasing toward east. Both terms are the (E, N)
    // components of the horizontal unit vector, so they share one scale factor.
    const east = -Math.sin(H) * cosDec;
    const north = cosLat > 1e-9 ? (vz - sinLat * clamped) / cosLat : 0;
    let az = Math.atan2(east, north) * RAD2DEG;
    if (az < 0) az += 360;
    azOut[index] = az;
  }

  function computePositions() {
    if (!window.Astronomy) {
      solarPos = [];
      resetPlanes();
      return;
    }
    const observer = selectedObserver();
    if (!observer) {
      $('#location-status').textContent = '坐标超出范围：纬度 −90° 至 90°，经度 −180° 至 180°。';
      solarPos = [];
      resetPlanes();
      return;
    }
    $('#location-status').textContent = '坐标只在本机使用。';

    const time = Astronomy.MakeTime(new Date(state.time));
    const lstDeg = ((Astronomy.SiderealTime(time) * 15 + observer.longitude) % 360 + 360) % 360;
    const latRad = observer.latitude * DEG;
    const sinLat = Math.sin(latRad);
    const cosLat = Math.cos(latRad);

    let m = null;
    try {
      const rotation = Astronomy.Rotation_EQJ_EQD(time);
      if (rotation && rotation.rot) m = rotation.rot;
    } catch (error) {
      m = null;
    }
    const m00 = m ? m[0][0] : 1, m01 = m ? m[1][0] : 0, m02 = m ? m[2][0] : 0;
    const m10 = m ? m[0][1] : 0, m11 = m ? m[1][1] : 1, m12 = m ? m[2][1] : 0;
    const m20 = m ? m[0][2] : 0, m21 = m ? m[1][2] : 0, m22 = m ? m[2][2] : 1;

    for (let i = 0; i < NS; i += 1) {
      const vx = sVx[i], vy = sVy[i], vz = sVz[i];
      toAltAz(m00 * vx + m01 * vy + m02 * vz, m10 * vx + m11 * vy + m12 * vz, m20 * vx + m21 * vy + m22 * vz, lstDeg, sinLat, cosLat, sAz, sAlt, i);
    }
    for (let i = 0; i < ND; i += 1) {
      const vx = dVx[i], vy = dVy[i], vz = dVz[i];
      toAltAz(m00 * vx + m01 * vy + m02 * vz, m10 * vx + m11 * vy + m12 * vz, m20 * vx + m21 * vy + m22 * vz, lstDeg, sinLat, cosLat, dAz, dAlt, i);
    }

    const transformPlane = (plane) => {
      for (let i = 0; i < plane.n; i += 1) {
        const vx = plane.vx[i], vy = plane.vy[i], vz = plane.vz[i];
        toAltAz(m00 * vx + m01 * vy + m02 * vz, m10 * vx + m11 * vy + m12 * vz, m20 * vx + m21 * vy + m22 * vz, lstDeg, sinLat, cosLat, plane.az, plane.alt, i);
      }
    };
    transformPlane(eclipticPlane);
    transformPlane(galacticPlane);

    const nextSolar = [];
    for (const body of SOLAR) {
      try {
        const equatorial = Astronomy.Equator(body.key, time, observer, true, true);
        const horizontal = Astronomy.Horizon(time, observer, equatorial.ra, equatorial.dec, 'normal');
        let magnitude = null;
        try {
          magnitude = Astronomy.Illumination(body.key, time).mag;
        } catch (error) {
          magnitude = null;
        }
        nextSolar.push({ key: body.key, ra: equatorial.ra, dec: equatorial.dec, azimuth: horizontal.azimuth, altitude: horizontal.altitude, magnitude });
      } catch (error) {
        nextSolar.push(null);
      }
    }
    solarPos = nextSolar;
  }

  function positionOf(entry) {
    if (!entry) return { az: 0, alt: -90, known: false };
    if (entry.kind === 'solar') {
      const index = SOLAR.findIndex((body) => body.key === entry.key);
      const found = index >= 0 ? solarPos[index] : null;
      if (!found) return { az: 0, alt: -90, known: false };
      return { az: found.azimuth, alt: found.altitude, known: true };
    }
    if (entry.kind === 'deep') return { az: dAz[entry.index], alt: dAlt[entry.index], known: true };
    return { az: sAz[entry.index], alt: sAlt[entry.index], known: true };
  }

  // ---------------------------------------------------------------- drawing ---
  function clipToCircle(x0, y0, x1, y1, cx, cy, r) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const fx = x0 - cx;
    const fy = y0 - cy;
    const a = dx * dx + dy * dy;
    if (a < 1e-9) return null;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const root = Math.sqrt(disc);
    const t1 = (-b - root) / (2 * a);
    if (t1 >= 0 && t1 <= 1) return t1;
    const t2 = (-b + root) / (2 * a);
    if (t2 >= 0 && t2 <= 1) return t2;
    return null;
  }

  /** Draw a great-circle reference line, clipping it at the horizon (r = radius). */
  function drawPlane(plane, radius, cx, cy, color, dash) {
    if (!plane.n || plane.n > PLANE_MAX) return;
    for (let i = 0; i < plane.n; i += 1) {
      const point = project(plane.az[i], plane.alt[i], radius, cx, cy);
      planeX[i] = point.x;
      planeY[i] = point.y;
      planeInside[i] = point.theta <= 90.02 ? 1 : 0;
    }
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.3;
    ctx.setLineDash(dash);
    ctx.beginPath();
    let drawing = false;
    for (let i = 0; i < plane.n; i += 1) {
      if (!planeInside[i]) {
        // Leaving the sky: finish the run exactly on the horizon circle.
        if (drawing) {
          const t = clipToCircle(planeX[i - 1], planeY[i - 1], planeX[i], planeY[i], cx, cy, radius);
          if (t !== null) ctx.lineTo(planeX[i - 1] + (planeX[i] - planeX[i - 1]) * t, planeY[i - 1] + (planeY[i] - planeY[i - 1]) * t);
          drawing = false;
        }
        continue;
      }
      if (!drawing) {
        // Entering the sky: start the run on the horizon circle.
        if (i > 0 && !planeInside[i - 1]) {
          const t = clipToCircle(planeX[i - 1], planeY[i - 1], planeX[i], planeY[i], cx, cy, radius);
          if (t !== null) ctx.moveTo(planeX[i - 1] + (planeX[i] - planeX[i - 1]) * t, planeY[i - 1] + (planeY[i] - planeY[i - 1]) * t);
          else ctx.moveTo(planeX[i], planeY[i]);
        } else {
          ctx.moveTo(planeX[i], planeY[i]);
        }
        drawing = true;
      } else {
        ctx.lineTo(planeX[i], planeY[i]);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Project a horizontal coordinate to the canvas. `theta` is the angular
   * distance from the view centre (>= 90 means "behind"/off the visible dome).
   */
  function project(az, alt, radius, cx, cy) {
    if (viewFrame.zenith) {
      const r = radius * (90 - alt) / 90;
      const angle = az * DEG - viewFrame.headingRad;
      // Looking-up dome view: east appears on the left, west on the right.
      return { x: cx - Math.sin(angle) * r, y: cy - Math.cos(angle) * r, theta: 90 - alt };
    }
    const a = az * DEG;
    const cAlt = Math.cos(alt * DEG);
    const e = cAlt * Math.sin(a);
    const n = cAlt * Math.cos(a);
    const u = Math.sin(alt * DEG);
    const forward = e * viewFrame.Fx + n * viewFrame.Fy + u * viewFrame.Fz;
    const up = e * viewFrame.Ux + n * viewFrame.Uy + u * viewFrame.Uz;
    const right = e * viewFrame.Rx + n * viewFrame.Ry;
    const hyp = Math.hypot(right, up);
    const theta = Math.acos(forward > 1 ? 1 : (forward < -1 ? -1 : forward));
    const r = radius * theta / (Math.PI / 2);
    const sx = hyp > 1e-9 ? right / hyp : 0;
    const sy = hyp > 1e-9 ? up / hyp : 1;
    return { x: cx + sx * r, y: cy - sy * r, theta: theta * RAD2DEG };
  }

  /**
   * Free-look grid. The horizon is no longer the outer circle, so the altitude
   * circles, azimuth meridians and horizon are sampled through the projection
   * and clipped to the visible hemisphere around the view centre.
   */
  function drawFreeGrid(radius, cx, cy) {
    ctx.save();
    fillBelowHorizon(radius, cx, cy);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(190,214,194,.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    const strokeCurve = (pointAt, count, style, dash, width) => {
      ctx.beginPath();
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      let started = false;
      for (let i = 0; i <= count; i += 1) {
        const coord = pointAt(i / count);
        const point = project(coord[0], coord[1], radius, cx, cy);
        if (point.theta <= 90.001) {
          if (started) ctx.lineTo(point.x, point.y);
          else {
            ctx.moveTo(point.x, point.y);
            started = true;
          }
        } else {
          started = false;
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };

    for (const altitude of [30, 60]) {
      strokeCurve((t) => [t * 360, altitude], 180, 'rgba(190,214,194,.16)', [3, 7], 1);
    }
    for (const altitude of [-30, -60]) {
      strokeCurve((t) => [t * 360, altitude], 180, 'rgba(150,178,162,.13)', [3, 7], 1);
    }
    for (let azimuth = 0; azimuth < 360; azimuth += 30) {
      const major = azimuth % 90 === 0;
      strokeCurve((t) => [azimuth, 90 - t * 180], 90, major ? 'rgba(190,214,194,.2)' : 'rgba(190,214,194,.08)', [], 1);
    }
    strokeCurve((t) => [t * 360, 0], 180, 'rgba(190,214,194,.42)', [], 1.3);

    ctx.font = '9px "DM Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    for (const altitude of [60, 30, -30, -60]) {
      const label = project(viewAz, altitude, radius, cx, cy);
      if (label.theta > 90.001) continue;
      ctx.fillStyle = altitude >= 0 ? 'rgba(205,222,207,.46)' : 'rgba(178,199,186,.34)';
      ctx.fillText(`${altitude}°`, label.x + 7, label.y - 4);
    }

    const cardinalLabels = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
    ctx.font = '10px "DM Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const azimuth of [0, 90, 180, 270]) {
      const point = project(azimuth, 0, radius, cx, cy);
      if (point.theta > 90.001) continue;
      const dx = point.x - cx;
      const dy = point.y - cy;
      const len = Math.hypot(dx, dy);
      const ox = len > 6 ? dx / len : 0;
      const oy = len > 6 ? dy / len : -1;
      ctx.fillStyle = 'rgba(222,234,222,.82)';
      ctx.fillText(cardinalLabels[azimuth], point.x + ox * 15, point.y + oy * 15);
    }

    const marker = (x, y, color, label, labelAbove) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 5, y);
      ctx.lineTo(x + 5, y);
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x, y + 5);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = '9px "DM Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = labelAbove ? 'bottom' : 'top';
      ctx.fillText(label, x, y + (labelAbove ? -8 : 8));
    };
    const zenith = project(viewAz, 90, radius, cx, cy);
    marker(zenith.x, zenith.y, 'rgba(205,222,207,.5)', '天顶', true);
    const nadir = project(viewAz, -90, radius, cx, cy);
    if (nadir.theta <= 90.001) marker(nadir.x, nadir.y, 'rgba(178,199,186,.34)', '天底', false);
    ctx.restore();
  }

  /**
   * Tint the region below the horizon inside the visible dome. The horizon
   * always meets the view circle at its left and right extremes, so the ground
   * is bounded by the horizon arc plus the lower half of the view circle.
   */
  function fillBelowHorizon(radius, cx, cy) {
    const samples = 180;
    const points = [];
    let all = true;
    let any = false;
    for (let i = 0; i < samples; i += 1) {
      const point = project(i * (360 / samples), 0, radius, cx, cy);
      points.push(point);
      const inside = point.theta <= 90.001;
      if (inside) any = true;
      else all = false;
    }
    ctx.fillStyle = GROUND_TINT;
    if (all || !any) {
      if (viewAlt >= 0) return;
      // The whole dome lies below the horizon.
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const start = points.findIndex((point, i) => point.theta <= 90.001 && points[(i - 1 + samples) % samples].theta > 90.001);
    let run = [];
    for (let k = 0; k < samples && points[(start + k) % samples].theta <= 90.001; k += 1) run.push(points[(start + k) % samples]);
    if (run[0].x > run[run.length - 1].x) run = run.slice().reverse();

    ctx.beginPath();
    ctx.moveTo(run[0].x, run[0].y);
    for (let i = 1; i < run.length; i += 1) ctx.lineTo(run[i].x, run[i].y);
    const steps = 60;
    for (let i = 0; i <= steps; i += 1) {
      const psi = 2 * Math.PI - (Math.PI * i) / steps;
      ctx.lineTo(cx + Math.cos(psi) * radius, cy - Math.sin(psi) * radius);
    }
    ctx.closePath();
    ctx.fill();
  }

  function draw() {
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(rect.width * ratio);
    const height = Math.round(rect.height * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const radius = Math.min(rect.width * 0.44, rect.height * 0.43) * zoom;
    updateViewFrame();

    if (viewMode === 'zenith') {
      const headingRad = heading * DEG;
      ctx.save();
      ctx.translate(cx, cy);
      for (let altitude = 0; altitude <= 60; altitude += 30) {
        const r = radius * (90 - altitude) / 90;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.strokeStyle = altitude === 0 ? 'rgba(190,214,194,.38)' : 'rgba(190,214,194,.16)';
        ctx.lineWidth = altitude === 0 ? 1.2 : 1;
        ctx.setLineDash(altitude === 0 ? [] : [3, 7]);
        ctx.stroke();
        ctx.setLineDash([]);
        if (altitude > 0) {
          ctx.fillStyle = 'rgba(205,222,207,.46)';
          ctx.font = '9px "DM Mono", monospace';
          ctx.fillText(`${altitude}°`, 7, -r - 4);
        }
      }
      for (let azimuth = 0; azimuth < 360; azimuth += 30) {
        const angle = azimuth * DEG - headingRad;
        const major = azimuth % 90 === 0;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-Math.sin(angle) * radius, -Math.cos(angle) * radius);
        ctx.strokeStyle = major ? 'rgba(190,214,194,.2)' : 'rgba(190,214,194,.08)';
        ctx.lineWidth = 1;
        ctx.stroke();
        const labelRadius = radius + 17;
        ctx.fillStyle = major ? 'rgba(222,234,222,.82)' : 'rgba(168,185,174,.58)';
        ctx.font = `${major ? '10px' : '8px'} "DM Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const labels = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
        ctx.fillText(labels[azimuth] || `${azimuth}°`, -Math.sin(angle) * labelRadius, -Math.cos(angle) * labelRadius);
      }
      ctx.restore();
    } else {
      drawFreeGrid(radius, cx, cy);
    }

    // Ecliptic and galactic plane centre lines, clipped to the view circle.
    if (state.showEcliptic) drawPlane(eclipticPlane, radius, cx, cy, 'rgba(242,150,122,.88)', [7, 5]);
    if (state.showGalactic) drawPlane(galacticPlane, radius, cx, cy, 'rgba(168,194,244,.9)', [2, 4]);

    hits = [];

    const maxMag = state.maxMag;
    // Free mode also draws the sky below the horizon, dimmed as a ground layer.
    const freeView = viewMode === 'free';
    for (let i = 0; i < ND; i += 1) {
      const alt = dAlt[i];
      if (deep[i].mag > maxMag) continue;
      const below = alt < 0;
      if (below && !freeView) continue;
      const point = project(dAz[i], alt, radius, cx, cy);
      if (point.theta > 90.05) continue;
      if (below) ctx.globalAlpha = BELOW_HORIZON_ALPHA;
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(237,191,118,.62)';
      ctx.lineWidth = 1;
      ctx.arc(point.x, point.y, 2.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      hits.push({ kind: 'deep', index: i, x: point.x, y: point.y, weight: 2 });
    }

    for (let i = 0; i < NS; i += 1) {
      const alt = sAlt[i];
      if (sMag[i] > maxMag) continue;
      const below = alt < 0;
      if (below && !freeView) continue;
      const point = project(sAz[i], alt, radius, cx, cy);
      if (point.theta > 90.05) continue;
      const size = sSize[i];
      ctx.fillStyle = sColor[i];
      if (below) ctx.globalAlpha = BELOW_HORIZON_ALPHA;
      if (size <= 1.5) {
        ctx.fillRect(point.x - 0.6, point.y - 0.6, 1.2, 1.2);
      } else {
        if (sGlow[i]) {
          ctx.shadowColor = '#d4e9d7';
          ctx.shadowBlur = size > 2.4 ? 8 : 4;
        }
        ctx.beginPath();
        ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
      // Every drawn star is tappable; brighter ones get a small priority bonus.
      hits.push({ kind: 'star', index: i, x: point.x, y: point.y, weight: Math.min(size, 3) });
    }

    SOLAR.forEach((body, index) => {
      const found = solarPos[index];
      if (!found) return;
      const below = found.altitude < 0;
      if (below && !freeView) return;
      const point = project(found.azimuth, found.altitude, radius, cx, cy);
      if (point.theta > 90.05) return;
      if (below) ctx.globalAlpha = BELOW_HORIZON_ALPHA;
      ctx.beginPath();
      ctx.fillStyle = body.color;
      ctx.shadowColor = body.color;
      ctx.shadowBlur = body.key === 'Sun' || body.key === 'Moon' ? 18 : 10;
      ctx.arc(point.x, point.y, body.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (body.key === 'Moon') {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(229,237,229,.66)';
        ctx.arc(point.x, point.y, body.size + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      hits.push({ kind: 'solar', key: body.key, x: point.x, y: point.y, weight: Math.min(body.size, 4) });
    });

    if (state.selected) {
      const target = selectedPoint(state.selected, radius, cx, cy);
      if (target) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(169,213,189,.95)';
        ctx.lineWidth = 1.4;
        ctx.arc(target.x, target.y, 11, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(169,213,189,.35)';
        ctx.arc(target.x, target.y, 17, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.beginPath();
    ctx.fillStyle = 'rgba(191,216,197,.78)';
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function selectedPoint(selection, radius, cx, cy) {
    const point = positionOf(selection);
    if (!point.known) return null;
    if (point.alt < 0 && viewMode !== 'free') return null;
    const projected = project(point.az, point.alt, radius, cx, cy);
    return projected.theta > 90.05 ? null : projected;
  }

  // ------------------------------------------------------------- selection ---
  function selectionId(kind, value) {
    return `${kind}:${value}`;
  }

  function select(selection, locate) {
    state.selected = selection;
    if (locate && selection) {
      const point = positionOf(selection);
      if (point.known) {
        if (viewMode === 'free') {
          setViewAz(point.az);
          setViewAlt(point.alt);
        } else {
          setHeading(point.az);
        }
      }
    }
    applySelectionClasses();
    updateDetailCard();
    invalidate(false);
  }

  function clearSelection() {
    state.selected = null;
    applySelectionClasses();
    updateDetailCard();
    invalidate(false);
  }

  function applySelectionClasses() {
    const id = state.selected ? state.selected.id : null;
    rowRecords.forEach((record) => {
      record.el.classList.toggle('selected', record.entry.id === id);
    });
  }

  function describeKind(entry) {
    if (entry.kind === 'solar') {
      const body = SOLAR.find((item) => item.key === entry.key);
      return body ? body.kind : '太阳系天体';
    }
    if (entry.kind === 'deep') return `深空天体 · ${deep[entry.index].t}`;
    return '恒星';
  }

  function labelOf(entry) {
    if (entry.kind === 'solar') {
      const body = SOLAR.find((item) => item.key === entry.key);
      return body ? body.name : entry.key;
    }
    if (entry.kind === 'deep') return deep[entry.index].label;
    return sLabel[entry.index];
  }

  function magnitudeOf(entry) {
    if (entry.kind === 'solar') {
      const index = SOLAR.findIndex((body) => body.key === entry.key);
      const found = solarPos[index];
      return found && Number.isFinite(found.magnitude) ? found.magnitude.toFixed(1) : '—';
    }
    if (entry.kind === 'deep') {
      const mag = deep[entry.index].mag;
      return Number.isFinite(mag) ? Number(mag).toFixed(1) : '—';
    }
    return sMag[entry.index].toFixed(2);
  }

  function equatorialOf(entry) {
    if (entry.kind === 'solar') {
      const index = SOLAR.findIndex((body) => body.key === entry.key);
      const found = solarPos[index];
      return found ? `${formatRa(found.ra)} / ${formatDec(found.dec)}` : '—';
    }
    if (entry.kind === 'deep') {
      const obj = deep[entry.index];
      return `${formatRa(obj.ra)} / ${formatDec(obj.dec)}`;
    }
    return `${formatRa(sRa[entry.index])} / ${formatDec(sDec[entry.index])}`;
  }

  function noteOf(entry) {
    if (entry.kind === 'deep') {
      const obj = deep[entry.index];
      return obj.en ? `别名 ${obj.en} · J2000 赤道坐标` : 'J2000 赤道坐标';
    }
    if (entry.kind === 'star') {
      const alias = sAlias[entry.index];
      return alias ? `西名 ${alias.charAt(0).toUpperCase()}${alias.slice(1)} · J2000 赤道坐标` : 'J2000 赤道坐标';
    }
    return '实时视位置';
  }

  function updateDetailCard() {
    if (!state.selected) {
      detailCard.hidden = true;
      return;
    }
    const entry = state.selected;
    const point = positionOf(entry);
    detailCard.hidden = false;
    $('#detail-kind').textContent = describeKind(entry);
    $('#detail-title').textContent = labelOf(entry);
    $('#detail-azimuth').textContent = point.known ? `${formatAz(point.az)} ${cardinalName(Math.round(point.az) % 360)}` : '—';
    $('#detail-altitude').textContent = point.known ? formatAlt(point.alt) : '—';
    $('#detail-magnitude').textContent = magnitudeOf(entry);
    $('#detail-equatorial').textContent = equatorialOf(entry);
    const parts = [];
    if (point.known) parts.push(point.alt >= 0 ? '当前位于地平线以上' : '当前位于地平线以下');
    const extra = noteOf(entry);
    if (extra) parts.push(extra);
    $('#detail-note').textContent = parts.join(' · ');
  }

  // ------------------------------------------------------------- object list ---
  function buildEntries() {
    const query = state.query.trim().toLowerCase();
    if (state.tab === 'solar') {
      return SOLAR.map((body) => ({
        kind: 'solar',
        key: body.key,
        id: selectionId('solar', body.key),
        label: body.name,
        sub: body.kind,
        symbol: body.symbol,
        color: body.color
      })).filter((entry) => !query || entry.label.toLowerCase().includes(query) || entry.key.toLowerCase().includes(query));
    }
    if (state.tab === 'deep') {
      const list = [];
      for (const i of deepOrder) {
        const obj = deep[i];
        if (query) {
          if (!`${obj.label} ${obj.en || ''} ${obj.n}`.toLowerCase().includes(query)) continue;
        } else if (obj.mag > state.maxMag) {
          continue;
        }
        list.push({ kind: 'deep', index: i, id: selectionId('deep', i), label: obj.label, sub: obj.t, symbol: '✦', color: '#edbf76' });
        if (list.length >= 400) break;
      }
      return list;
    }
    const list = [];
    for (let i = 0; i < NS; i += 1) {
      if (query) {
        if (!`${sLabel[i]} ${sAlias[i]}`.toLowerCase().includes(query)) continue;
      } else if (sMag[i] > state.maxMag) {
        continue;
      }
      list.push({ kind: 'star', index: i, id: selectionId('star', i), label: sLabel[i], sub: `视星等 ${sMag[i].toFixed(2)}`, symbol: '✦', color: '#d6e6d7' });
      if (list.length >= 400) break;
    }
    return list;
  }

  function updateObjectCount(count) {
    let total = SOLAR.length;
    if (state.tab === 'deep') total = state.query ? ND : deepCountWithinLimit();
    if (state.tab === 'star') total = state.query ? NS : starCountWithinLimit();
    $('#object-count').textContent = state.query ? `${count} / ${total} 匹配` : `${total} ${state.tab === 'solar' ? 'BODIES' : 'OBJECTS'}`;
  }

  function starCountWithinLimit() {
    let count = 0;
    for (let i = 0; i < NS; i += 1) if (sMag[i] <= state.maxMag) count += 1;
    return count;
  }

  function deepCountWithinLimit() {
    let count = 0;
    for (let i = 0; i < ND; i += 1) if (deep[i].mag <= state.maxMag) count += 1;
    return count;
  }

  function renderList() {
    const entries = buildEntries();
    rowRecords = [];
    if (!entries.length) {
      objectList.innerHTML = `<div class="loading-row">${state.query ? '没有匹配的天体' : '暂无可显示的天体'}</div>`;
      updateObjectCount(0);
      return;
    }
    const fragment = document.createDocumentFragment();
    entries.forEach((entry) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'object-row';
      row.dataset.id = entry.id;
      const name = document.createElement('span');
      name.className = 'object-name';
      const symbol = document.createElement('span');
      symbol.className = 'object-symbol';
      symbol.style.color = entry.color;
      symbol.textContent = entry.symbol;
      const label = document.createElement('span');
      label.className = 'object-label';
      label.textContent = entry.label;
      const sub = document.createElement('small');
      sub.textContent = entry.sub;
      label.appendChild(sub);
      name.append(symbol, label);
      const az = document.createElement('span');
      az.className = 'object-coord';
      const alt = document.createElement('span');
      alt.className = 'object-coord';
      row.append(name, az, alt);
      row.addEventListener('click', () => {
        select(entry, true);
        row.scrollIntoView({ block: 'nearest' });
      });
      fragment.appendChild(row);
      rowRecords.push({ el: row, entry, azEl: az, altEl: alt });
    });
    objectList.innerHTML = '';
    objectList.appendChild(fragment);
    updateObjectCount(entries.length);
    applySelectionClasses();
    refreshListCoords();
  }

  function refreshListCoords() {
    rowRecords.forEach((record) => {
      const point = positionOf(record.entry);
      const visible = point.known && point.alt >= 0;
      record.azEl.textContent = `${formatAz(point.az)} 方位`;
      record.altEl.textContent = formatAlt(point.alt);
      record.azEl.classList.toggle('below', !visible);
      record.altEl.classList.toggle('below', !visible);
    });
  }

  // ----------------------------------------------------------------- events ---
  function updateViewReadout() {
    const rounded = ((Math.round(viewMode === 'free' ? viewAz : heading) % 360) + 360) % 360;
    const cardinal = cardinalName(rounded);
    headingSlider.value = String(rounded);
    altitudeSlider.value = String(viewAlt);
    $('#heading-readout').textContent = `${String(rounded).padStart(3, '0')}°`;
    $('#heading-cardinal').textContent = viewMode === 'free'
      ? (viewAlt >= 89.5 ? '天顶' : `${cardinal} · ${formatAlt(viewAlt)}`)
      : cardinal;
    $('#slider-heading').innerHTML = `${String(rounded).padStart(3, '0')}° <small>${cardinal}</small>`;
    $('#slider-altitude').textContent = formatAlt(viewAlt);
  }

  function setHeading(value) {
    heading = ((Number(value) % 360) + 360) % 360;
    updateViewReadout();
    invalidate(false);
  }

  function setViewAz(value) {
    viewAz = ((Number(value) % 360) + 360) % 360;
    updateViewReadout();
    invalidate(false);
  }

  function setViewAlt(value) {
    viewAlt = Math.max(MIN_VIEW_ALT, Math.min(90, Number(value)));
    updateViewReadout();
    invalidate(false);
  }

  function applyViewModeUI() {
    const free = viewMode === 'free';
    $('#mode-zenith').setAttribute('aria-pressed', free ? 'false' : 'true');
    $('#mode-free').setAttribute('aria-pressed', free ? 'true' : 'false');
    stage.classList.toggle('free-view', free);
    // Altitude is pinned at the zenith outside free mode, so its slider is inert.
    altitudeSlider.disabled = !free;
    $('#view-mode-note').textContent = free ? '地平坐标 · 自由视角（天顶在上）' : '地平坐标 · 仰视（东在左）';
    updateViewReadout();
  }

  function setViewMode(mode) {
    if (mode !== 'free' && mode !== 'zenith') return;
    if (mode === viewMode) return;
    if (mode === 'free') {
      // Keep the current orientation: at the zenith the dome rolls 180°.
      viewAz = (heading + 180) % 360;
      viewAlt = 90;
    } else {
      heading = ((viewAz + 180) % 360 + 360) % 360;
      viewAlt = 90;
    }
    viewMode = mode;
    applyViewModeUI();
    invalidate(false);
  }

  function locate() {
    const status = $('#location-status');
    if (!navigator.geolocation) {
      status.textContent = '此浏览器不支持设备定位。';
      return;
    }
    status.textContent = '正在等待位置授权…';
    navigator.geolocation.getCurrentPosition((position) => {
      latitudeInput.value = position.coords.latitude.toFixed(4);
      longitudeInput.value = position.coords.longitude.toFixed(4);
      status.textContent = `定位精度约 ${Math.round(position.coords.accuracy)} 米 · 坐标只在本机使用。`;
      invalidate(true);
    }, (error) => {
      status.textContent = error.code === 1 ? '位置权限未开启；你仍可手动输入坐标。' : '暂时无法取得位置；请检查设备定位或手动输入。';
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 });
  }

  function orientationChanged(event) {
    let direction = event.webkitCompassHeading;
    if (!Number.isFinite(direction) && event.absolute && Number.isFinite(event.alpha)) direction = (360 - event.alpha) % 360;
    if (viewMode === 'free') {
      if (Number.isFinite(direction)) setViewAz(direction);
      if (Number.isFinite(event.beta)) {
        const gamma = Number.isFinite(event.gamma) ? event.gamma : 0;
        const tilt = Math.asin(Math.max(-1, Math.min(1, -Math.cos(event.beta * DEG) * Math.cos(gamma * DEG)))) * RAD2DEG;
        setViewAlt(tilt);
      }
      return;
    }
    if (Number.isFinite(direction)) setHeading(direction);
  }

  async function toggleSensor() {
    const button = $('#sensor-button');
    const status = $('#sensor-status');
    if (sensorEnabled) {
      window.removeEventListener('deviceorientation', sensorHandler);
      sensorEnabled = false;
      button.setAttribute('aria-pressed', 'false');
      status.textContent = '手动方位';
      return;
    }
    if (!('DeviceOrientationEvent' in window)) {
      status.textContent = '设备不支持方向传感器';
      return;
    }
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') throw new Error('permission');
      }
      sensorHandler = orientationChanged;
      window.addEventListener('deviceorientation', sensorHandler, true);
      sensorEnabled = true;
      button.setAttribute('aria-pressed', 'true');
      status.textContent = '等待设备方向…';
      setTimeout(() => {
        if (sensorEnabled && status.textContent === '等待设备方向…') status.textContent = '无磁力计数据，请手动调整';
      }, 2500);
    } catch (error) {
      status.textContent = '未授权；可手动拖动星图';
    }
  }

  // ------------------------------------------------------------------- loop ---
  function updateTimeReadouts() {
    const date = new Date(state.time);
    if (document.activeElement !== dateInput) dateInput.value = toLocalInputValue(date, true);
    $('#utc-value').textContent = `UTC ${date.toISOString().slice(11, 19)}`;
    $('#sky-date').textContent = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(date);
    const sun = solarPos[SOLAR.findIndex((body) => body.key === 'Sun')];
    $('#sky-caption-text').textContent = sun ? `太阳高度 ${sun.altitude.toFixed(1)}° · ${sun.altitude >= 0 ? '日间天象' : '夜间天象'}` : '正在计算当前天象';
  }

  let lastFrame = 0;
  function frame(ts) {
    const dt = lastFrame ? Math.min(0.5, (ts - lastFrame) / 1000) : 0;
    lastFrame = ts;
    if (state.playing) {
      if (state.mode === 'live') state.time = Date.now();
      else state.time += dt * speed() * 1000;
      state.invalid = true;
    }
    if (state.invalid) {
      computePositions();
      state.invalid = false;
      needDraw = true;
    }
    if (needDraw) {
      draw();
      needDraw = false;
      if (ts >= nextListRefresh) {
        refreshListCoords();
        updateDetailCard();
        nextListRefresh = ts + 250;
      }
      if (ts >= nextReadoutRefresh) {
        updateTimeReadouts();
        nextReadoutRefresh = ts + 200;
      }
    }
    requestAnimationFrame(frame);
  }

  // -------------------------------------------------------------- wiring up ---
  dateInput.addEventListener('change', () => {
    const parsed = new Date(dateInput.value);
    if (Number.isNaN(parsed.getTime())) return;
    state.mode = 'manual';
    state.time = parsed.getTime();
    updatePlaybackUI();
    invalidate(true);
  });
  latitudeInput.addEventListener('change', () => invalidate(true));
  longitudeInput.addEventListener('change', () => invalidate(true));
  headingSlider.addEventListener('input', () => {
    if (viewMode === 'free') setViewAz(Number(headingSlider.value));
    else setHeading(Number(headingSlider.value));
  });
  altitudeSlider.addEventListener('input', () => {
    setViewAlt(Number(altitudeSlider.value));
  });
  $('#mode-zenith').addEventListener('click', () => setViewMode('zenith'));
  $('#mode-free').addEventListener('click', () => setViewMode('free'));
  $('#now-button').addEventListener('click', goLive);
  $('#sync-button').addEventListener('click', goLive);
  $('#play-button').addEventListener('click', togglePlay);
  $('#reverse-button').addEventListener('click', toggleDirection);
  $('#faster-button').addEventListener('click', () => stepRate(1));
  $('#slower-button').addEventListener('click', () => stepRate(-1));
  $('#locate-button').addEventListener('click', locate);
  $('#sensor-button').addEventListener('click', toggleSensor);
  $('#detail-close').addEventListener('click', clearSelection);
  // Adaptive zoom step. Leading digit 1–2 gets one decade below the current
  // order, leading digit 2–9 gets the current order, so the ladder reads
  // 0.8→0.9→1.0→1.1…1.9→2→3…9→10→11…19→20→30…→100.
  function zoomStep(value) {
    const order = 10 ** Math.floor(Math.log10(value));
    return value / order < 2 ? order / 10 : order;
  }

  function nudgeZoom(direction) {
    const next = Number((zoom + zoomStep(zoom) * direction).toFixed(2));
    zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
    $('#zoom-label').textContent = `${Math.round(zoom * 100)}%`;
    invalidate(false);
  }

  $('#zoom-out').addEventListener('click', () => nudgeZoom(-1));
  $('#zoom-in').addEventListener('click', () => nudgeZoom(1));

  document.querySelectorAll('.object-tabs [data-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      state.tab = tab.dataset.tab;
      document.querySelectorAll('.object-tabs [data-tab]').forEach((other) => {
        const active = other === tab;
        other.classList.toggle('active', active);
        other.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      renderList();
    });
  });
  searchInput.addEventListener('input', () => {
    state.query = searchInput.value;
    renderList();
  });

  const magSlider = $('#mag-slider');
  magSlider.addEventListener('input', () => {
    state.maxMag = Number(magSlider.value);
    $('#mag-value').textContent = state.maxMag.toFixed(1);
    if (state.tab === 'star' || state.tab === 'deep') renderList();
    invalidate(false);
  });

  function wirePlaneToggle(id, key) {
    const button = $(id);
    if (!button) return;
    button.addEventListener('click', () => {
      state[key] = !state[key];
      button.setAttribute('aria-pressed', state[key] ? 'true' : 'false');
      invalidate(false);
    });
  }
  wirePlaneToggle('#ecliptic-toggle', 'showEcliptic');
  wirePlaneToggle('#galactic-toggle', 'showGalactic');

  let dragStart = null;
  let dragMoved = false;
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    dragStart = {
      x: event.clientX,
      y: event.clientY,
      angle: Math.atan2(event.clientY - rect.top - rect.height / 2, event.clientX - rect.left - rect.width / 2) * RAD2DEG,
      heading,
      az: viewAz,
      alt: viewAlt,
      mode: viewMode,
      radius: Math.min(rect.width * 0.44, rect.height * 0.43) * zoom
    };
    dragMoved = false;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (error) {
      // Synthetic pointers (tests, some assistive tools) have no active capture.
    }
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragStart || sensorEnabled) return;
    if (Math.abs(event.clientX - dragStart.x) > 3 || Math.abs(event.clientY - dragStart.y) > 3) dragMoved = true;
    if (dragStart.mode === 'free') {
      // Axis-separated pan: horizontal drag turns the azimuth, vertical drag
      // raises/lowers the altitude, so the sky follows the pointer per axis.
      const dx = event.clientX - dragStart.x;
      const dy = event.clientY - dragStart.y;
      const degPerPixel = 90 / Math.max(1, dragStart.radius);
      setViewAz(dragStart.az - dx * degPerPixel);
      setViewAlt(dragStart.alt + dy * degPerPixel);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const angle = Math.atan2(event.clientY - rect.top - rect.height / 2, event.clientX - rect.left - rect.width / 2) * RAD2DEG;
    const delta = ((angle - dragStart.angle + 540) % 360) - 180;
    // Mirrored (looking-up) view: drag follows the pointer on the flipped axis.
    setHeading(dragStart.heading + delta);
  });
  canvas.addEventListener('pointerup', (event) => {
    if (dragStart && !dragMoved) handleTap(event);
    dragStart = null;
    dragMoved = false;
  });
  canvas.addEventListener('pointercancel', () => { dragStart = null; dragMoved = false; });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    nudgeZoom(-Math.sign(event.deltaY));
  }, { passive: false });

  function handleTap(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    // Fingers are imprecise: widen the catch radius for touch input.
    const limit = event.pointerType === 'touch' ? 34 : 22;
    let best = null;
    let bestScore = Infinity;
    hits.forEach((hit) => {
      const distance = Math.hypot(hit.x - x, hit.y - y);
      if (distance > limit) return;
      // Larger/brighter objects win near-ties so crowded fields stay predictable.
      const score = distance - hit.weight;
      if (score < bestScore) {
        bestScore = score;
        best = hit;
      }
    });
    if (!best) {
      clearSelection();
      return;
    }
    if (best.kind === 'solar') select({ kind: 'solar', key: best.key, id: selectionId('solar', best.key) }, false);
    else select({ kind: best.kind, index: best.index, id: selectionId(best.kind, best.index) }, false);
  }

  window.addEventListener('resize', () => invalidate(false));
  document.addEventListener('visibilitychange', () => invalidate(true));
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => invalidate(false)).observe(stage);
  }

  renderList();
  updateDetailCard();
  applyViewModeUI();
  requestAnimationFrame(frame);
})();
