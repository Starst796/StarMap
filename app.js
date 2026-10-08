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
  const dVx = new Float64Array(ND);
  const dVy = new Float64Array(ND);
  const dVz = new Float64Array(ND);
  const dAz = new Float32Array(ND);
  const dAlt = new Float32Array(ND);
  const dMag = new Float32Array(ND);

  for (let i = 0; i < ND; i += 1) {
    const obj = deep[i];
    const raRad = obj.ra * DEG;
    const decRad = obj.dec * DEG;
    const cd = Math.cos(decRad);
    dVx[i] = cd * Math.cos(raRad);
    dVy[i] = cd * Math.sin(raRad);
    dVz[i] = Math.sin(decRad);
    dMag[i] = Number.isFinite(obj.mag) ? obj.mag : 12;
    dAlt[i] = -90;
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
    selected: null,
    invalid: true
  };

  let heading = 0;
  let zoom = 1;
  let sensorEnabled = false;
  let sensorHandler = null;
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
      return;
    }
    const observer = selectedObserver();
    if (!observer) {
      $('#location-status').textContent = '坐标超出范围：纬度 −90° 至 90°，经度 −180° 至 180°。';
      solarPos = [];
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
  function project(az, alt, radius, cx, cy, headingRad) {
    const r = radius * (90 - alt) / 90;
    const angle = az * DEG - headingRad;
    // Looking-up dome view: east appears on the left, west on the right.
    return { x: cx - Math.sin(angle) * r, y: cy - Math.cos(angle) * r };
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

    hits = [];

    for (let i = 0; i < ND; i += 1) {
      const alt = dAlt[i];
      if (alt < 0) continue;
      const point = project(dAz[i], alt, radius, cx, cy, headingRad);
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(237,191,118,.62)';
      ctx.lineWidth = 1;
      ctx.arc(point.x, point.y, 2.6, 0, Math.PI * 2);
      ctx.stroke();
      hits.push({ kind: 'deep', index: i, x: point.x, y: point.y });
    }

    for (let i = 0; i < NS; i += 1) {
      const alt = sAlt[i];
      if (alt < 0) continue;
      const point = project(sAz[i], alt, radius, cx, cy, headingRad);
      const size = sSize[i];
      ctx.fillStyle = sColor[i];
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
      if (size >= 2.1) hits.push({ kind: 'star', index: i, x: point.x, y: point.y });
    }

    SOLAR.forEach((body, index) => {
      const found = solarPos[index];
      if (!found || found.altitude < 0) return;
      const point = project(found.azimuth, found.altitude, radius, cx, cy, headingRad);
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
      hits.push({ kind: 'solar', key: body.key, x: point.x, y: point.y });
    });

    if (state.selected) {
      const target = selectedPoint(state.selected, radius, cx, cy, headingRad);
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

  function selectedPoint(selection, radius, cx, cy, headingRad) {
    const point = positionOf(selection);
    if (!point.known || point.alt < 0) return null;
    return project(point.az, point.alt, radius, cx, cy, headingRad);
  }

  // ------------------------------------------------------------- selection ---
  function selectionId(kind, value) {
    return `${kind}:${value}`;
  }

  function select(selection, locate) {
    state.selected = selection;
    if (locate && selection) {
      const point = positionOf(selection);
      if (point.known) setHeading(point.az);
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
      for (let i = 0; i < ND; i += 1) {
        const obj = deep[i];
        if (query && !`${obj.label} ${obj.en || ''} ${obj.n}`.toLowerCase().includes(query)) continue;
        list.push({ kind: 'deep', index: i, id: selectionId('deep', i), label: obj.label, sub: obj.t, symbol: '✦', color: '#edbf76' });
        if (list.length >= 400) break;
      }
      return list;
    }
    const list = [];
    for (let i = 0; i < NS; i += 1) {
      if (query && !`${sLabel[i]} ${sAlias[i]}`.toLowerCase().includes(query)) continue;
      list.push({ kind: 'star', index: i, id: selectionId('star', i), label: sLabel[i], sub: `视星等 ${sMag[i].toFixed(2)}`, symbol: '✦', color: '#d6e6d7' });
      if (list.length >= 400) break;
    }
    return list;
  }

  function updateObjectCount(count) {
    const total = state.tab === 'solar' ? SOLAR.length : (state.tab === 'deep' ? ND : NS);
    $('#object-count').textContent = state.query ? `${count} / ${total} 匹配` : `${total} ${state.tab === 'solar' ? 'BODIES' : 'OBJECTS'}`;
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
  function setHeading(value) {
    heading = ((Number(value) % 360) + 360) % 360;
    const rounded = Math.round(heading) % 360;
    headingSlider.value = String(rounded);
    const cardinal = cardinalName(rounded);
    $('#heading-readout').textContent = `${String(rounded).padStart(3, '0')}°`;
    $('#heading-cardinal').textContent = cardinal;
    $('#slider-heading').innerHTML = `${String(rounded).padStart(3, '0')}° <small>${cardinal}</small>`;
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
  headingSlider.addEventListener('input', () => setHeading(Number(headingSlider.value)));
  $('#now-button').addEventListener('click', goLive);
  $('#sync-button').addEventListener('click', goLive);
  $('#play-button').addEventListener('click', togglePlay);
  $('#reverse-button').addEventListener('click', toggleDirection);
  $('#faster-button').addEventListener('click', () => stepRate(1));
  $('#slower-button').addEventListener('click', () => stepRate(-1));
  $('#locate-button').addEventListener('click', locate);
  $('#sensor-button').addEventListener('click', toggleSensor);
  $('#detail-close').addEventListener('click', clearSelection);
  $('#zoom-out').addEventListener('click', () => { zoom = Math.max(0.8, zoom - 0.1); $('#zoom-label').textContent = `${Math.round(zoom * 100)}%`; invalidate(false); });
  $('#zoom-in').addEventListener('click', () => { zoom = Math.min(1.35, zoom + 0.1); $('#zoom-label').textContent = `${Math.round(zoom * 100)}%`; invalidate(false); });

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

  let dragStart = null;
  let dragMoved = false;
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    dragStart = {
      x: event.clientX,
      y: event.clientY,
      angle: Math.atan2(event.clientY - rect.top - rect.height / 2, event.clientX - rect.left - rect.width / 2) * RAD2DEG,
      heading
    };
    dragMoved = false;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragStart || sensorEnabled) return;
    if (Math.abs(event.clientX - dragStart.x) > 3 || Math.abs(event.clientY - dragStart.y) > 3) dragMoved = true;
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
    zoom = Math.min(1.35, Math.max(0.8, zoom - Math.sign(event.deltaY) * 0.06));
    $('#zoom-label').textContent = `${Math.round(zoom * 100)}%`;
    invalidate(false);
  }, { passive: false });

  function handleTap(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let best = null;
    let bestDistance = 20;
    hits.forEach((hit) => {
      const distance = Math.hypot(hit.x - x, hit.y - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = hit;
      }
    });
    if (!best) {
      clearSelection();
      return;
    }
    if (best.kind === 'solar') select({ kind: 'solar', key: best.key, id: selectionId('solar', best.key) }, false);
    else select({ kind: best.kind, index: best.index, id: selectionId(best.kind, best.index) }, false);
    if (state.selected) {
      const match = rowRecords.find((record) => record.entry.id === state.selected.id);
      if (match) match.el.scrollIntoView({ block: 'nearest' });
    }
  }

  window.addEventListener('resize', () => invalidate(false));
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => invalidate(false)).observe(stage);
  }

  renderList();
  updateDetailCard();
  requestAnimationFrame(frame);
})();
