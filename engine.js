/* BOQ Cabinet Engine — JS port of BOQ-Cabinet Generator v4.9.0
 * (calculate / layout / corner_layout_plan + corner_safety), base cabinets.
 * Units: millimetres; door_open_angle in radians. No DOM, no Three.js.
 * Sinks and the continuous L/U backsplash are not ported in this prototype. */
(function (root) {
'use strict';
const PI = Math.PI, floor = Math.floor, ceil = Math.ceil;
const round = (v, n) => { const f = 10 ** n; return Math.round(v * f) / f; };
const deg = r => r * 180 / PI, rad = g => g * PI / 180;
const range = (a, b) => { const r = []; for (let i = a; i < b; i++) r.push(i); return r; };
const E = (th, en) => { const x = Error(th); x.en = en; return x; };
const title = s => s.charAt(0) + s.slice(1).toLowerCase();

const RATES = {
  wood_laminate_rate: 1250, color_laminate_rate: 1100, back_rate: 280, shaker_glass_rate: 850,
  backsplash_rate: 950, countertop_composite_rate: 2800, countertop_quartz_rate: 4800,
  countertop_terrazzo_rate: 3500, countertop_granite_rate: 6200, hinge_rate: 80, handle_rate: 150,
  drawer_slide_rate: 450, drawer_handle_rate: 150, nose_gap_rate: 120, shelf_support_rate: 8,
  mount_bracket_rate: 150, mount_rail_rate: 250, edge_rate: 30, plinth_rate: 200,
  kickstand_rate: 120, labor_rate: 1200, waste_percent: 10,
  carcass_rate: 850, door_rate: 1100, drawer_push_rate: 180,
  sink_unit_rate: 3000, sink_cutout_rate: 600, sink_install_rate: 900, appliance_rate: 0
};

const DEFAULTS = Object.assign({
  cabinet_type: 'BASE', front_style: 'CLOSED', width: 1800, depth: 600, height: 900,
  carcass_thickness: 18, back_thickness: 6, back_inset: 12, shelf_count: 0, shelf_clearance: 0,
  door_count: 4, door_columns: 4, door_rows: 1, door_gap: 3, vertical_divisions: 3,
  horizontal_divisions: 0, show_handles: true, use_nose_gap: false, nose_gap_height: 25,
  hinges_per_door: 2, base_type: 'PLINTH', show_plinth: true, support_type: 'PLINTH',
  plinth_height: 100, plinth_setback: 60, installation_height: 0,
  include_backsplash: false, backsplash_height: 530, backsplash_thickness: 10,
  door_open_angle: 0, carcass_finish: 'WOOD', carcass_tone: 'OAK', door_finish: 'COLOR',
  door_tone: 'GREY', door_style: 'FLAT', shaker_frame_width: 65, shaker_recess_depth: 4,
  shaker_glass_thickness: 5,
  enable_drawers: true, drawer_run: 'MAIN', drawer_column: 1, drawer_count: 4,
  drawer_box_thickness: 15, drawer_bottom_thickness: 6, drawer_slide_clearance: 13,
  drawer_depth: 450, drawer_extension: 0, drawer_motion_mode: 'HANDLE',
  drawer_multi_bank_mode: true, drawer_banks: [],
  corner_smart_enabled: true, corner_auto_filler: true, corner_min_filler_mm: 45,
  corner_max_filler_mm: 425, corner_manual_left_mm: 45, corner_manual_right_mm: 45,
  layout_shape: 'L', l_corner_side: 'LEFT', return_left_length: 1500, return_right_length: 1500,
  layout_align_dividers: true, customize_return_runs: false,
  return_left_door_columns: 2, return_right_door_columns: 2, return_left_door_rows: 1,
  return_right_door_rows: 1, return_left_vertical_divisions: 0, return_right_vertical_divisions: 0,
  return_left_horizontal_divisions: 0, return_right_horizontal_divisions: 0,
  return_left_door_style: 'INHERIT', return_right_door_style: 'INHERIT',
  return_left_frame_width: 65, return_right_frame_width: 65,
  include_sink: false, include_countertop: true, countertop_material: 'QUARTZ',
  countertop_thickness: 20, countertop_front_overhang: 20, countertop_side_overhang: 10,
  countertop_cost_basis: 'GROSS', wall_back_offset: 0,
  sink_quantity: 1, sink_run: 'MAIN', sink_width: 500, sink_depth: 400, sink_bowl_depth: 180,
  sink_x_offset: 0, sink_front_setback: 90, sink2_run: 'MAIN', sink2_width: 500, sink2_depth: 400,
  sink2_bowl_depth: 180, sink2_x_offset: 550, sink2_front_setback: 90, appliances: []
}, RATES);

const WALL_TYPES = new Set(['WALL', 'WALL_OPEN']);
const OPEN_TYPES = new Set(['OPEN', 'WALL_OPEN']);
const FLOOR_TYPES = new Set(['BASE', 'OPEN', 'TALL']);
const clone = d => JSON.parse(JSON.stringify(d));
const withDefaults = d => { for (const k in DEFAULTS) if (!(k in d)) d[k] = clone(DEFAULTS[k]); return d; };

function effective_base_type(d) {
  if (WALL_TYPES.has(d.cabinet_type)) return 'NONE';
  return d.base_type ?? (d.show_plinth ? 'PLINTH' : 'NONE');
}
const support_height = d => effective_base_type(d) !== 'NONE' ? d.plinth_height : 0;
const body_height = d => d.height - support_height(d);

function compartment_geometry(d) {
  const w = d.width, dep = d.depth, t = d.carcass_thickness, b = d.back_thickness;
  const h = body_height(d), v = d.vertical_divisions | 0, r = d.horizontal_divisions | 0;
  const inner_w = w - 2 * t, inner_h = h - 2 * t;
  const bay_w = (inner_w - v * t) / (v + 1), bay_h = (inner_h - r * t) / (r + 1);
  const usable_depth = dep - d.back_inset - b;
  const back_y = dep / 2 - d.back_inset - b / 2;
  const inner_front_y = -dep / 2, inner_back_y = back_y - b / 2;
  const shelf_y = (inner_front_y + inner_back_y) / 2;
  return {
    inner_w, inner_h, bay_w, bay_h, usable_depth, back_y, shelf_y,
    bay_centers_x: range(0, v + 1).map(i => -inner_w / 2 + (i + .5) * bay_w + i * t),
    div_centers_x: range(0, v).map(i => -inner_w / 2 + (i + 1) * bay_w + (i + .5) * t),
    row_centers_z: range(0, r + 1).map(j => t + (j + .5) * bay_h + j * t),
    horizontal_centers_z: range(0, r).map(j => t + (j + 1) * bay_h + (j + .5) * t)
  };
}

const drawer_safe_travel_mm = depth => { depth = Math.max(0, +depth); return Math.max(0, Math.min(900, depth - 35, depth * .95)); };

function configured_drawer_banks(d) {
  if (!d.enable_drawers) return [];
  const max = drawer_safe_travel_mm(d.drawer_depth);
  if (d.drawer_multi_bank_mode)
    return (d.drawer_banks || []).map(b => ({ column: b.column | 0, count: b.count | 0, hardware: 'HANDLE',
      pulls: (b.pulls || [0, 0, 0, 0, 0, 0]).map(v => Math.min(Math.max(0, +v), max)) }));
  return [{ column: d.drawer_column | 0, count: d.drawer_count | 0, hardware: 'HANDLE',
    pulls: Array(d.drawer_count | 0).fill(Math.min(Math.max(0, +d.drawer_extension), max)) }];
}
const drawer_bank_columns = d => new Set(configured_drawer_banks(d).map(b => b.column));
/* Columns that hold no swing door. Drawer banks (add-on), plus two additions
 * that the add-on does not have: blind-corner bays hidden behind a return
 * (_blind_cols) and appliance openings such as a dishwasher (_appliance_cols). */
const appliance_columns = d => new Set((d._appliance_cols || []).map(Number));
const blind_columns = d => new Set((d._blind_cols || []).map(Number));
const blind_panels = d => new Set((d._blind_panels || []).map(Number));
const closed_columns = d => new Set([...drawer_bank_columns(d), ...appliance_columns(d), ...blind_columns(d)]);
const fixed_horizontal_bays = d => { const c = drawer_bank_columns(d), a = appliance_columns(d); return range(1, (d.vertical_divisions | 0) + 2).filter(i => !c.has(i) && !a.has(i)); };

/* ---- sinks (ported from the add-on) ---- */
function active_sink_specs(d) {
  if (!d.include_sink) return [];
  if (d._sink_specs) return d._sink_specs.map(s => ({ ...s }));
  const count = +d.sink_quantity || 1;
  if (count !== 1 && count !== 2) throw E('อ่างล้างจานต้องมี 1 หรือ 2 ใบ', 'Sink models must be 1 or 2');
  const specs = [{ index: 1, run: d.sink_run || 'MAIN', width: +d.sink_width, depth: +d.sink_depth, bowl_depth: +d.sink_bowl_depth, x_offset: +d.sink_x_offset, front_setback: +d.sink_front_setback }];
  if (count === 2) specs.push({ index: 2, run: d.sink2_run || 'MAIN', width: +d.sink2_width, depth: +d.sink2_depth, bowl_depth: +d.sink2_bowl_depth, x_offset: +d.sink2_x_offset, front_setback: +d.sink2_front_setback });
  return specs;
}
function sink_cutout_info(d, spec) {
  spec = spec || active_sink_specs(d)[0];
  const front = -d.depth / 2 - d.countertop_front_overhang;
  return [+spec.x_offset, front + +spec.front_setback + +spec.depth / 2, +spec.width, +spec.depth];
}

function* drawer_specs(d) {
  if (!d.enable_drawers) return;
  const g = compartment_geometry(d), h = body_height(d), gap = +d.door_gap;
  const top_gap = d.use_nose_gap ? +d.nose_gap_height : 0;
  const box_t = +d.drawer_box_thickness, bottom_t = +d.drawer_bottom_thickness;
  const outer_w = g.bay_w - 2 * d.drawer_slide_clearance, depth = +d.drawer_depth;
  const door_w = (d.width - (d.door_columns + 1) * gap) / d.door_columns;
  for (const bank of configured_drawer_banks(d)) {
    const col = bank.column - 1, count = bank.count;
    const face_h = (h - (count + 1) * gap - top_gap) / count;
    const front_cx = -d.width / 2 + gap + door_w * (col + .5) + gap * col;
    const bay_cx = g.bay_centers_x[col];
    for (let n = 0; n < count; n++) {
      const ext = +bank.pulls[n], face_bottom = gap + n * (face_h + gap);
      let side_h = Math.max(55, Math.min(face_h - 30, face_h * .72));
      const z_bottom = Math.max(d.carcass_thickness + 8, face_bottom + gap + 10);
      if (z_bottom + side_h > h - d.carcass_thickness - 8) side_h = Math.max(45, h - d.carcass_thickness - 8 - z_bottom);
      yield { index: n + 1, front_x: front_cx, box_x: bay_cx, front_y: -d.depth / 2 - d.carcass_thickness / 2 - ext,
        face_h, face_z: face_bottom + face_h / 2, box_z: z_bottom, side_h, box_w: outer_w, box_d: depth,
        box_t, bottom_t, ext, drawer_column: col + 1 };
    }
  }
}

function validate(d) {
  withDefaults(d);
  const w = d.width, dep = d.depth, t = d.carcass_thickness, b = d.back_thickness;
  const h = body_height(d), v = d.vertical_divisions | 0, r = d.horizontal_divisions | 0;
  if (w <= 2 * t + 20) throw E('ความกว้างต้องมากกว่าความหนาโครง 2 ด้าน + 20 มม.', 'Width must exceed twice the board thickness + 20 mm');
  if (dep <= b + d.back_inset + 30) throw E('ความลึกน้อยเกินไปสำหรับแผ่นหลังและระยะร่น', 'Depth too small for the back panel and inset');
  if (h <= 2 * t + 30) throw E('ความสูงหักฐานแล้วน้อยเกินไป', 'Height minus plinth is too small');
  if (effective_base_type(d) === 'PLINTH' && d.plinth_setback * 2 + 2 * t >= dep) throw E('ระยะร่นฐานมากเกินความลึกตู้', 'Plinth setback too large for cabinet depth');
  if ((w - 2 * t - v * t) / (v + 1) <= 35) throw E('แบ่งช่องแนวตั้งมากเกินความกว้างตู้', 'Too many vertical divisions for this width');
  if ((h - 2 * t - r * t) / (r + 1) <= 35) throw E('แบ่งช่องแนวนอนมากเกินความสูงตู้', 'Too many horizontal divisions for this height');
  const sinks = active_sink_specs(d);
  if (sinks.length && FLOOR_TYPES.has(d.cabinet_type)) {
    if (!d.include_countertop) throw E('ต้องเปิดท็อปเคาน์เตอร์ก่อนใส่อ่างล้างจาน', 'Enable the countertop to include a sink');
    if (sinks.length > 2) throw E('อ่างล้างจานได้สูงสุด 2 ใบ', 'Maximum 2 sink models per layout');
    const ct_w = w + 2 * d.countertop_side_overhang, ct_d = dep + d.countertop_front_overhang, ct_y = -d.countertop_front_overhang / 2;
    const top_recess = d.use_nose_gap ? Math.min(35, dep * .2) : 0, top_y = top_recess / 2, holes = [];
    for (const spec of sinks) {
      const [ox, oy, sw, sd] = sink_cutout_info(d, spec);
      if (sw <= 50 || sd <= 50 || +spec.bowl_depth <= 0) throw E('ขนาดอ่างต้องเป็นค่าบวก', 'Sink width, depth and bowl depth must be positive');
      if (Math.abs(ox) + sw / 2 + 35 > ct_w / 2 || Math.abs(oy - ct_y) + sd / 2 + 35 > ct_d / 2) throw E(`อ่างที่ ${spec.index} ชิดขอบท็อปเกินไป`, `Sink ${spec.index} too close to the countertop edge`);
      if (Math.abs(ox) + (sw + 20) / 2 + 12 > (w - 2 * t) / 2 || Math.abs(oy - top_y) + (sd + 20) / 2 + 12 > (dep - top_recess) / 2) throw E(`อ่างที่ ${spec.index} ชิดขอบตู้เกินไป`, `Sink ${spec.index} too close to the cabinet top edge`);
      holes.push([ox, oy, sw, sd]);
    }
    if (holes.length === 2) {
      const [x1, y1, w1, d1] = holes[0], [x2, y2, w2, d2] = holes[1];
      if (Math.abs(x1 - x2) < (w1 + w2) / 2 + 35 && Math.abs(y1 - y2) < (d1 + d2) / 2 + 35) throw E('อ่าง 2 ใบซ้อนหรือชิดกันเกินไป ย้ายอ่างที่ 2', 'Two sinks overlap or are too close; move sink 2');
    }
  }
  if (d.front_style === 'OPEN') { d.door_columns = 0; d.door_rows = 0; d.door_count = 0; }
  else {
    const cols = d.door_columns | 0, rows = d.door_rows | 0;
    if (cols < 1 || rows < 1) throw E('จำนวนบานต้องอย่างน้อย 1', 'Doors and rows must each be at least 1');
    if (cols * rows > 64) throw E('สูงสุด 64 บานต่อตู้', 'Maximum 64 doors per cabinet');
    const gap = d.door_gap, nose = d.use_nose_gap ? d.nose_gap_height : 0;
    if ((w - (cols + 1) * gap) / cols <= 35) throw E('จำนวนบานมากเกินความกว้างตู้', 'Too many doors for this width');
    if ((h - (rows + 1) * gap - rows * nose) / rows <= 50) throw E('จำนวนแถวบานมากเกินไป', 'Too many door rows');
    d.door_count = cols * rows;
  }
  if (d.enable_drawers) {
    if (WALL_TYPES.has(d.cabinet_type) || d.front_style === 'OPEN') throw E('ลิ้นชักใช้ได้กับตู้ล่างแบบมีบานเท่านั้น', 'Drawers need a closed base cabinet');
    if (d.vertical_divisions !== d.door_columns - 1) throw E('ลิ้นชักต้องมีผนังกั้น = จำนวนบาน − 1', 'Drawers need dividers = doors − 1');
    const g = compartment_geometry(d), box_t = +d.drawer_box_thickness;
    if (g.bay_w - 2 * d.drawer_slide_clearance <= 2 * box_t + 35) throw E('ช่องแคบเกินไปสำหรับรางและกล่องลิ้นชัก', 'Bay too narrow for slides and drawer box');
    if (d.drawer_depth > g.usable_depth - 30 || d.drawer_depth < 120) throw E('ความลึกลิ้นชักต้อง 120 มม. ถึงความลึกใช้งาน − 30 มม.', 'Drawer depth must be 120 mm to usable depth − 30 mm');
    const seen = new Set();
    for (const bank of configured_drawer_banks(d)) {
      const col = bank.column;
      if (col < 1 || col > d.door_columns) throw E(`ลิ้นชักคอลัมน์ ${col} อยู่นอกตู้ (1–${d.door_columns})`, `Drawer column ${col} is outside the run (1–${d.door_columns})`);
      if (seen.has(col)) throw E(`มีชุดลิ้นชักซ้ำในคอลัมน์ ${col}`, `More than one drawer bank in column ${col}`);
      seen.add(col);
      if (bank.count < 1 || bank.count > 6) throw E('ลิ้นชัก 1–6 ชั้นต่อชุด', 'Each bank holds 1–6 drawers');
      const face = (h - (bank.count + 1) * d.door_gap - (d.use_nose_gap ? d.nose_gap_height : 0)) / bank.count;
      if (face < 90 || face <= 2 * box_t + 30) throw E(`ลิ้นชักคอลัมน์ ${col} มากเกินความสูงตู้`, `Too many drawers in column ${col} for the cabinet height`);
      const bay_center = g.bay_centers_x[col - 1];
      for (const sink of active_sink_specs(d))
        if (Math.abs(+sink.x_offset - bay_center) < (+sink.width + g.bay_w) / 2 + 15) throw E(`อ่างทับลิ้นชักช่อง ${col} ย้ายอ่างหรือลิ้นชัก`, `Sink intersects drawer column ${col}; move the sink or drawer bank`);
    }
  }
  return d;
}

function calculate(d0) {
  const d = validate(clone(d0)), g = compartment_geometry(d);
  const w = d.width, dep = d.depth, t = d.carcass_thickness, b = d.back_thickness, h = body_height(d);
  const v = d.vertical_divisions, r = d.horizontal_divisions, parts = [];
  function part(category, name, cut_l, cut_w, thick, qty, edges = [], unit = 'm2', rate = 0, unit_qty = null) {
    if (qty === 0) return;
    const edge_len = edges.reduce((s, e) => s + (e === 'L1' || e === 'L2' ? cut_l : cut_w), 0) / 1000 * qty;
    const area = unit === 'm2' ? cut_l * cut_w * qty / 1e6 : 0;
    const quantity = unit_qty == null ? (unit === 'm2' ? area : qty) : unit_qty;
    parts.push({ category, name, length_mm: round(cut_l, 3), width_mm: round(cut_w, 3), thickness_mm: thick,
      pieces: qty, unit, quantity: round(quantity, 4), unit_rate: rate, material_cost: round(quantity * rate, 2),
      edge_m: round(edge_len, 4), edge_sides: edges.join(',') });
  }
  const finish = { WOOD: d.wood_laminate_rate, COLOR: d.color_laminate_rate };
  const carcass_rate = finish[d.carcass_finish], door_rate = finish[d.door_finish];
  part('CARCASS', title(d.carcass_finish) + ' Laminate Side Panel', h, dep, t, 2, ['L1'], 'm2', carcass_rate);
  const top_recess = d.door_count && d.use_nose_gap ? Math.min(35, dep * .2) : 0;
  part('CARCASS', 'Top Panel', g.inner_w, dep - top_recess, t, 1, ['L1'], 'm2', carcass_rate);
  part('CARCASS', 'Bottom Panel', g.inner_w, dep, t, 1, ['L1'], 'm2', carcass_rate);
  part('BACK', `Back Panel (Matching Side Finish: ${title(d.carcass_finish)} / ${title(d.carcass_tone)})`, g.inner_w, g.inner_h, b, 1, [], 'm2', d.back_rate);
  if (v) part('CARCASS', 'Vertical Divider', g.inner_h, g.usable_depth, t, v, ['L1'], 'm2', carcass_rate);
  if (r) { const bays = fixed_horizontal_bays(d); if (bays.length) part('CARCASS', 'Horizontal Divider', g.bay_w, g.usable_depth, t, r * bays.length, ['L1'], 'm2', carcass_rate); }
  const dcols = drawer_bank_columns(d);
  if (d.door_count) {
    const gap = d.door_gap, cols = d.door_columns, rows = d.door_rows;
    const dw = (w - (cols + 1) * gap) / cols, nose = d.use_nose_gap ? d.nose_gap_height : 0;
    const dh = (h - (rows + 1) * gap - rows * nose) / rows;
    const closed = closed_columns(d), door_total = (cols - closed.size) * rows;
    part('DOOR', `${title(d.door_finish)} Laminate Door Panel (${cols} columns x ${rows} rows)`, dh, dw, t, door_total, ['L1', 'L2', 'W1', 'W2'], 'm2', door_rate);
    const bp = (d._blind_panels || []).filter(c => !drawer_bank_columns(d).has(c)).length * rows;
    part('DOOR', `${title(d.door_finish)} Blind Corner Fixed Panel (no hinges)`, dh, dw, t, bp, ['L1', 'L2', 'W1', 'W2'], 'm2', door_rate);
    part('HARDWARE', 'Hinge', 0, 0, 0, door_total * d.hinges_per_door, [], 'pcs', d.hinge_rate);
    if (d.show_handles && !d.use_nose_gap) part('HARDWARE', 'Handle', 0, 0, 0, door_total, [], 'pcs', d.handle_rate);
    if (d.use_nose_gap) {
      const rw = dcols.size ? g.bay_w : g.inner_w, seg = dcols.size ? fixed_horizontal_bays(d).length : 1;
      if (seg) part('HARDWARE', 'Nose Gap Finger-Pull Rail (per door row)', rw, 0, 0, rows * seg, [], 'm', d.nose_gap_rate, rw * rows * seg / 1000);
    }
  }
  if (d.enable_drawers) {
    const face_w = (w - (d.door_columns + 1) * d.door_gap) / d.door_columns, specs = [...drawer_specs(d)];
    for (const bank of configured_drawer_banks(d)) {
      const drs = specs.filter(x => x.drawer_column === bank.column);
      if (!drs.length) continue;
      const n = drs.length, f = drs[0], p = `Drawer C${bank.column}`, inside = f.box_w - 2 * f.box_t;
      part('DRAWER_FRONT', p + ' Flat Front (matching door finish)', f.face_h, face_w, t, n, ['L1', 'L2', 'W1', 'W2'], 'm2', door_rate);
      part('DRAWER_BOX', p + ' Box Side Panels', f.box_d, f.side_h, f.box_t, n * 2, ['L1'], 'm2', carcass_rate);
      part('DRAWER_BOX', p + ' Box Front & Back', inside, f.side_h, f.box_t, n * 2, ['L1'], 'm2', carcass_rate);
      part('DRAWER_BOTTOM', p + ' Bottom Panel', inside, f.box_d - 2 * f.box_t, f.bottom_t, n, [], 'm2', d.back_rate);
      part('HARDWARE', p + ' Full-Extension Slide Pair', 0, 0, 0, n, [], 'pair', d.drawer_slide_rate);
      part('HARDWARE', p + ' Drawer Handle', 0, 0, 0, n, [], 'pcs', d.drawer_handle_rate);
    }
  }
  const base = effective_base_type(d);
  if (base === 'PLINTH') {
    const ph = d.plinth_height, tp = 18, fb = w - 2 * tp, side = dep - d.plinth_setback * 2;
    part('PLINTH', 'Front Toe-Kick Panel', fb, ph, tp, 1, [], 'm', d.plinth_rate, fb / 1000);
    part('PLINTH', 'Rear Support Plinth', fb, ph, tp, 1, [], 'm', d.plinth_rate, fb / 1000);
    part('PLINTH', 'Side Plinth Returns', side, ph, tp, 2, [], 'm', d.plinth_rate, 2 * side / 1000);
  } else if (base === 'LEGS') part('KICKSTAND', 'Adjustable Kickstand / Cabinet Foot', 0, 0, 0, 4, [], 'pcs', d.kickstand_rate);
  if (d.include_countertop && FLOOR_TYPES.has(d.cabinet_type)) {
    const rates = { TERRAZZO: d.countertop_terrazzo_rate, COMPOSITE: d.countertop_composite_rate, QUARTZ: d.countertop_quartz_rate, GRANITE: d.countertop_granite_rate, WOOD: d.wood_laminate_rate };
    const label = { TERRAZZO: 'Terrazzo', COMPOSITE: 'Composite Solid Surface', QUARTZ: 'Engineered Quartz', GRANITE: 'Natural Granite', WOOD: 'Wood Laminate' }[d.countertop_material];
    /* Corner infill (not in the add-on): a return shortened by a corner filler
     * leaves a strip of open countertop between its end and the main run's
     * front edge. Extend the return top to close it, and price it. */
    const cf = +(d._corner_filler_width_mm || 0);
    d._ct_ext = cf > 0.01 && !d._compat ? Math.max(0, cf - d.countertop_side_overhang - d.countertop_front_overhang) : 0;
    part('COUNTERTOP', label + ' Countertop', w + 2 * d.countertop_side_overhang + d._ct_ext, dep + d.countertop_front_overhang, d.countertop_thickness, 1, [], 'm2', rates[d.countertop_material]);
    for (const spec of active_sink_specs(d)) {
      const n = spec.index, sw = +spec.width, sd = +spec.depth;
      if (d.countertop_cost_basis === 'NET') part('COUNTERTOP', `Sink ${n} Opening Area Deduction (NET only)`, sw, sd, d.countertop_thickness, 1, [], 'm2', rates[d.countertop_material], -sw * sd / 1e6);
      part('SINK', `Sink ${n} Supply (one basin)`, 0, 0, 0, 1, [], 'pcs', d.sink_unit_rate);
      part('CUTOUT', `Sink ${n} Countertop Cutout / Fabrication`, 0, 0, 0, 1, [], 'pcs', d.sink_cutout_rate);
      part('SINK', `Sink ${n} Installation / Sealant`, 0, 0, 0, 1, [], 'pcs', d.sink_install_rate);
    }
  }
  if (d.include_backsplash && FLOOR_TYPES.has(d.cabinet_type)) part('BACKSPLASH', 'Backsplash Panel', w, d.backsplash_height, d.backsplash_thickness, 1, [], 'm2', d.backsplash_rate);
  if (WALL_TYPES.has(d.cabinet_type)) {
    part('MOUNT', 'Wall Hanging Brackets', 0, 0, 0, 2, [], 'pcs', d.mount_bracket_rate);
    part('MOUNT', 'Wall Mounting Rail', w, 0, 0, 1, [], 'm', d.mount_rail_rate, w / 1000);
  }
  const fw = +(d._corner_filler_width_mm || 0);
  if (fw > 0.01) part('CARCASS', 'Corner Clearance Filler Panel', h, fw, t, 1, ['L1', 'L2', 'W1', 'W2'], 'm2', carcass_rate);
  for (const c of [...appliance_columns(d)].sort((a, b) => a - b)) part('APPLIANCE', `Dishwasher Opening C${c} (appliance by owner)`, 0, 0, 0, 1, [], 'pcs', d.appliance_rate || 0);
  part('LABOR', 'Cabinet Assembly', 0, 0, 0, 1, [], 'set', d.labor_rate);
  const PANEL = new Set(['CARCASS', 'BACK', 'DOOR', 'GLASS', 'BACKSPLASH', 'COUNTERTOP', 'DRAWER_FRONT', 'DRAWER_BOX', 'DRAWER_BOTTOM']);
  const panel_cost = parts.filter(p => PANEL.has(p.category)).reduce((s, p) => s + p.material_cost, 0);
  const edge_m = parts.reduce((s, p) => s + p.edge_m, 0), edge_cost = edge_m * d.edge_rate;
  const waste = panel_cost * d.waste_percent / 100;
  const total = parts.reduce((s, p) => s + p.material_cost, 0) + edge_cost + waste;
  return [d, parts, { panel_cost: round(panel_cost, 2), edge_m: round(edge_m, 3), edge_cost: round(edge_cost, 2),
    waste_cost: round(waste, 2), total: round(total, 2), panel_area_m2: round(parts.filter(p => p.unit === 'm2').reduce((s, p) => s + p.quantity, 0), 3) }];
}

const automatic_return_door_columns = (d, run) => Math.max(1, Math.min(8, floor(run * Math.max(1, d.door_columns | 0) / d.width + .5)));

function layout_modules_raw(d0) {
  const d = withDefaults(clone(d0)), shape = d.layout_shape;
  const w = d.width, dep = d.depth, t = d.carcass_thickness;
  /* Lenient by design (differs from the add-on, which raises): a drawer bank on
   * a run that the current shape lacks, or on a column the run no longer has,
   * is set aside and reported in _dropped_banks, so switching shapes never
   * breaks the model. Pass _strict:true for the add-on's behaviour. */
  const keep = (banks, run, cols, dropped) => {
    const seen = new Set(), out = [];
    for (const b of banks) {
      if (b.run !== run) continue;
      const c = b.column | 0;
      if (c < 1 || c > cols || seen.has(c)) { if (d._strict) throw E(`ลิ้นชักคอลัมน์ ${c} อยู่นอกตู้ (1–${cols})`, `Drawer column ${c} is outside the run (1–${cols})`); dropped.push({ ...b, why: 'column' }); continue; }
      seen.add(c); out.push(clone(b));
    }
    return out;
  };
  /* Sinks and appliance openings follow the same per-run split. Sinks on a run
   * the shape lacks are set aside (the add-on raises; _strict keeps that). */
  const sinksAll = active_sink_specs(d), droppedSinks = [];
  const sinksFor = (run, runs) => sinksAll.filter(s => {
    if (s.run === run) return true;
    if (!runs.includes(s.run) && run === 'MAIN') { if (d._strict) throw E(`อ่างที่ ${s.index} อยู่บนแนวที่ไม่มีในผังนี้`, `Sink ${s.index} run is not present in this layout`); droppedSinks.push(s); }
    return false;
  });
  const setSinks = (m, run, runs) => { m._sink_specs = sinksFor(run, runs); m.include_sink = m._sink_specs.length > 0; };
  const keepAppl = (m, run) => {
    const taken = new Set([...(m.drawer_banks || []).map(b => b.column | 0), ...(m._blind_cols || [])]);
    m._appliance_cols = [];
    for (const a of d.appliances || []) {
      const c = a.column | 0;
      if (a.run !== run || c < 1 || c > m.door_columns || taken.has(c)) continue;
      taken.add(c); m._appliance_cols.push(c);
    }
  };
  /* Blind-corner bays (not in the add-on): a main-run door whose width is more
   * than half hidden behind a return cannot open and is not built as a door. */
  const blindFor = (m, sides) => {
    if (d._compat || m.front_style === 'OPEN') return [];
    const cols = m.door_columns | 0, gap = +m.door_gap, dw = (w - (cols + 1) * gap) / cols, out = [];
    m._blind_panels = [];
    for (let c = 1; c <= cols; c++) {
      const x0 = -w / 2 + gap + (c - 1) * (dw + gap), x1 = x0 + dw;
      for (const s of sides) {
        const z0 = s === 'LEFT' ? -w / 2 : w / 2 - dep, z1 = s === 'LEFT' ? -w / 2 + dep : w / 2;
        const ov = Math.max(0, Math.min(x1, z1) - Math.max(x0, z0));
        if (ov > dw * .5 && !out.includes(c)) {
          out.push(c);
          /* Part of the bay still shows beside the return (e.g. 350 mm deep wall
           * cabinets on 600 mm columns): close it with a fixed blind panel. */
          if (dw - ov > 30) m._blind_panels.push(c);
        }
      }
    }
    return out;
  };
  if (shape === 'STRAIGHT') {
    if (d._strict && d.enable_drawers && d.drawer_banks.some(b => b.run !== 'MAIN')) throw E('ผังตรงรองรับลิ้นชักบนแนวหลักเท่านั้น', 'Straight layout supports drawers on the main run only');
    const m = clone(d), dropped = d.drawer_banks.filter(b => b.run !== 'MAIN').map(b => ({ ...b, why: 'run' }));
    m.drawer_banks = keep(d.drawer_banks, 'MAIN', d.door_columns | 0, dropped);
    m.enable_drawers = !!d.enable_drawers && m.drawer_banks.length > 0; m._dropped_banks = dropped;
    m._sink_specs = sinksAll; m.include_sink = sinksAll.length > 0; m._blind_cols = []; keepAppl(m, 'MAIN'); m._dropped_sinks = droppedSinks;
    return [['MAIN', m, 0, 0, 0]];
  }
  const sides = shape === 'L' ? [d.l_corner_side] : ['LEFT', 'RIGHT'];
  if (shape === 'U' && w < 2 * dep + 2 * t + 40) throw E('ผัง U: ความยาวแนวหลักต้องมากกว่าความลึก 2 เท่า + ระยะเผื่อ', 'U layout: main run must exceed twice the depth plus clearance');
  if (shape === 'L' && w < dep + 2 * t + 40) throw E('ผัง L: ความยาวแนวหลักต้องมากกว่าความลึก + ระยะเผื่อ', 'L layout: main run must exceed the depth plus clearance');
  const runs = ['MAIN', ...sides];
  if (d._strict && d.enable_drawers && d.drawer_banks.some(b => !runs.includes(b.run))) throw E('มีชุดลิ้นชักอยู่บนแนวที่ไม่มีในผังนี้', 'A drawer bank is on a run this layout does not have');
  const dropped = d.drawer_banks.filter(b => !runs.includes(b.run)).map(b => ({ ...b, why: 'run' }));
  const primary = clone(d);
  primary.drawer_banks = keep(d.drawer_banks, 'MAIN', d.door_columns | 0, dropped);
  primary.enable_drawers = !!d.enable_drawers && primary.drawer_banks.length > 0;
  const align = !!d.layout_align_dividers && d.front_style !== 'OPEN';
  if (align) primary.vertical_divisions = Math.max(0, (primary.door_columns | 0) - 1);
  primary.include_backsplash = false;
  setSinks(primary, 'MAIN', runs); primary._blind_cols = blindFor(primary, sides); keepAppl(primary, 'MAIN');
  const mods = [['MAIN', primary, 0, 0, 0]];
  for (const side of sides) {
    const length = side === 'LEFT' ? d.return_left_length : d.return_right_length;
    const filler = +((d._corner_filler_widths || {})[side] || 0);
    const run = length - dep - filler;
    if (run <= 2 * t + 40) throw E(`แนวขา${side === 'LEFT' ? 'ซ้าย' : 'ขวา'}ต้องยาวกว่าความลึกตู้อย่างน้อย ${2 * t + 40} มม.`, `${side === 'LEFT' ? 'Left' : 'Right'} return must exceed the cabinet depth by at least ${2 * t + 40} mm`);
    const sub = clone(d);
    sub.width = run; sub._corner_filler_width_mm = filler; sub._corner_side = side; sub.include_backsplash = false;
    if (d.customize_return_runs) {
      const s = side.toLowerCase();
      for (const p of ['door_columns', 'door_rows', 'vertical_divisions', 'horizontal_divisions']) sub[p] = d[`return_${s}_${p}`] | 0;
      if (align) sub.vertical_divisions = Math.max(0, sub.door_columns - 1);
    } else {
      sub.door_columns = automatic_return_door_columns(d, run);
      sub.vertical_divisions = d.front_style !== 'OPEN' ? Math.max(0, sub.door_columns - 1)
        : Math.min(d.vertical_divisions | 0, Math.max(0, floor(run / 350) - 1));
    }
    sub.drawer_banks = keep(d.drawer_banks, side, sub.door_columns, dropped);
    sub.enable_drawers = !!d.enable_drawers && sub.drawer_banks.length > 0;
    setSinks(sub, side, runs); sub._blind_cols = []; keepAppl(sub, side);
    sub.layout_shape = 'STRAIGHT';
    const x = side === 'LEFT' ? -w / 2 + dep / 2 : w / 2 - dep / 2;
    mods.push(['RETURN_' + side, sub, x, -length / 2 - filler / 2, side === 'LEFT' ? PI / 2 : -PI / 2]);
  }
  mods[0][1]._dropped_banks = dropped; mods[0][1]._dropped_sinks = droppedSinks;
  return mods;
}

/* ---------- corner_safety ---------- */
function aabb(local, tx = 0, ty = 0, angle = 0) {
  const [x0, x1, y0, y1] = local, co = Math.cos(angle), si = Math.sin(angle), xs = [], ys = [];
  for (const x of [x0, x1]) for (const y of [y0, y1]) { xs.push(tx + co * x - si * y); ys.push(ty + si * x + co * y); }
  return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
}
const intersects = (a, b, m = .5) => Math.min(a[1], b[1]) - Math.max(a[0], b[0]) > m && Math.min(a[3], b[3]) - Math.max(a[2], b[2]) > m;
const body_bounds = ([, d, x, y, a]) => aabb([-d.width / 2, d.width / 2, -d.depth / 2, d.depth / 2], x, y, a);
function filler_bounds(d, side, f) {
  const w = +d.width, dep = +d.depth, t = +d.carcass_thickness;
  const inner = side === 'LEFT' ? -w / 2 + dep : w / 2 - dep;
  /* Fixed vs the add-on: corner_safety.py placed this proxy one board thickness
   * on the room side (inner ± t/2 mirrored), while make_layout() builds the real
   * filler inside the return's envelope. The proxy then blocked the drawers next
   * to the corner and drove the filler to its 425 mm cap. Match the real panel. */
  const cx = side === 'LEFT' ? inner - t / 2 : inner + t / 2, cy = -dep / 2 - f / 2;
  return [cx - t / 2, cx + t / 2, cy - f / 2, cy + f / 2];
}
function* local_drawer_boxes(run, col, count, pulls) {
  const gap = +run.door_gap, t = +run.carcass_thickness, w = +run.width, dep = +run.depth, cols = run.door_columns | 0, v = run.vertical_divisions | 0;
  const inner = w - 2 * t, bayw = (inner - v * t) / (v + 1);
  if (!(col >= 1 && col <= cols) || col > v + 1) return;
  const face_w = (w - (cols + 1) * gap) / cols;
  const front_x = -w / 2 + gap + (col - .5) * face_w + (col - 1) * gap, box_x = -inner / 2 + (col - .5) * bayw + (col - 1) * t;
  const boxw = bayw - 2 * run.drawer_slide_clearance, boxd = +run.drawer_depth;
  for (let n = 0; n < count; n++) {
    const p = +pulls[n];
    yield [n + 1, [[front_x - face_w / 2, front_x + face_w / 2, -dep / 2 - t - p - 20, -dep / 2], [box_x - boxw / 2, box_x + boxw / 2, -dep / 2 - p, -dep / 2 + boxd]]];
  }
}
function drawer_interference(mod, others, bank, travel = null) {
  const [, run, x, y, a] = mod;
  let pulls = [...bank.pulls];
  if (travel !== null) pulls = pulls.map((_, k) => k + 1 === (bank._drawer_index || 0) ? travel : 0);
  for (const [i, rects] of local_drawer_boxes(run, bank.column | 0, bank.count | 0, pulls)) {
    if (bank._drawer_index && i !== bank._drawer_index) continue;
    for (const r of rects) { const wr = aabb(r, x, y, a); if (others.some(bl => intersects(wr, bl))) return i; }
  }
  return 0;
}
function door_local_bounds(run, col, theta) {
  const w = +run.width, dep = +run.depth, t = +run.carcass_thickness, cols = run.door_columns | 0, gap = +run.door_gap;
  const dw = (w - (cols + 1) * gap) / cols, center = -w / 2 + gap + (col - .5) * dw + (col - 1) * gap;
  const side = (col - 1) % 2 === 0 ? -1 : 1, px = center + side * dw / 2, py = -dep / 2, ang = side * theta;
  const co = Math.cos(ang), si = Math.sin(ang), tf = (X, Y) => { const xx = X - px, yy = Y - py; return [px + co * xx - si * yy, py + si * xx + co * yy]; };
  const pts = [];
  for (const xx of [center - dw / 2, center + dw / 2]) for (const yy of [-dep / 2 - t, -dep / 2]) pts.push(tf(xx, yy));
  if (run.show_handles && !run.use_nose_gap) {
    const hx = center + ((col - 1) % 2 === 0 ? dw * .3 : -dw * .3);
    for (const xx of [hx - 12, hx + 12]) for (const yy of [-dep / 2 - t - 24, -dep / 2 - t]) pts.push(tf(xx, yy));
  }
  return [Math.min(...pts.map(p => p[0])), Math.max(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[1]))];
}
function door_interference(mod, others, col, angle) {
  const [, run, x, y, rot] = mod;
  if (angle < 1e-5 || (run.front_style || 'CLOSED') !== 'CLOSED') return false;
  const steps = Math.max(2, ceil(deg(angle) / 5));
  for (let i = 0; i <= steps; i++) { const r = aabb(door_local_bounds(run, col, angle * i / steps), x, y, rot); if (others.some(b => intersects(r, b))) return true; }
  return false;
}
function blockers(mods, focus, base, fillers) {
  const o = mods.filter(m => m[0] !== focus).map(body_bounds);
  for (const s in fillers) if (fillers[s] > 0) o.push(filler_bounds(base, s, fillers[s]));
  return o;
}
function problems(mods, base, fillers) {
  const found = [];
  if (mods.length < 2) return found;
  for (const m of mods) {
    const [name, run] = m, others = blockers(mods, name, base, fillers);
    if (run.enable_drawers) for (const bank of run.drawer_banks || [])
      for (let ix = 1; ix <= bank.count; ix++) if (drawer_interference(m, others, { ...bank, _drawer_index: ix })) found.push([name, 'DRAWER', bank.column, ix]);
    if ((run.front_style || 'CLOSED') === 'CLOSED') for (let col = 1; col <= run.door_columns; col++) {
      if (run.enable_drawers && (run.drawer_banks || []).some(b => (b.column | 0) === col)) continue;
      if ((run._blind_cols || []).includes(col) || (run._appliance_cols || []).includes(col)) continue;
      if (door_interference(m, others, col, +(run.door_open_angle || 0))) found.push([name, 'DOOR', col, 0]);
    }
  }
  return found;
}
function safe_pull(mod, others, bank, ix, wanted) {
  wanted = Math.max(0, wanted); if (wanted < .01) return 0;
  const b = { ...bank, _drawer_index: ix };
  if (drawer_interference(mod, others, b, 0)) return 0;
  if (!drawer_interference(mod, others, b, wanted)) return wanted;
  let lo = 0, hi = wanted;
  for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (drawer_interference(mod, others, b, mid)) hi = mid; else lo = mid; }
  return Math.max(0, lo - 1);
}
function safe_angle_column(mod, others, col, wanted) {
  if (wanted <= 0) return 0;
  if (door_interference(mod, others, col, .001)) return 0;
  if (!door_interference(mod, others, col, wanted)) return wanted;
  let lo = 0, hi = wanted;
  for (let i = 0; i < 13; i++) { const mid = (lo + hi) / 2; if (door_interference(mod, others, col, mid)) hi = mid; else lo = mid; }
  return Math.max(0, lo - rad(.2));
}
function active_drawer_sweep([, run, x, y, rot]) {
  const out = [];
  if (!run.enable_drawers) return out;
  for (const bank of run.drawer_banks || []) for (const [, boxes] of local_drawer_boxes(run, bank.column | 0, bank.count | 0, bank.pulls)) for (const b of boxes) out.push(aabb(b, x, y, rot));
  return out;
}
function door_sweep_rects([, run, x, y, rot], col, angle) {
  if (angle <= 1e-5) return [];
  const steps = Math.max(2, ceil(deg(angle) / 5));
  return range(0, steps + 1).map(i => aabb(door_local_bounds(run, col, angle * i / steps), x, y, rot));
}
function enforce(mods, base, fillers) {
  const results = [], notices = [];
  for (const m of mods) {
    const [name, old, x, y, rot] = m, run = { ...old };
    const others = blockers(mods, name, base, fillers);
    run.drawer_banks = (old.drawer_banks || []).map(b => ({ ...b, pulls: [...b.pulls] }));
    if (run.enable_drawers) for (const bank of run.drawer_banks) {
      bank._corner_safe_limits_mm = [];
      for (let ix = 1; ix <= bank.count; ix++) {
        const old_pull = +bank.pulls[ix - 1], limit = Math.min(900, Math.max(0, run.drawer_depth - 35), run.drawer_depth * .95);
        const max = safe_pull([name, run, x, y, rot], others, bank, ix, limit), safe = Math.min(old_pull, max);
        bank._corner_safe_limits_mm.push(round(max, 2)); bank.pulls[ix - 1] = round(safe, 3);
        if (safe + .5 < old_pull) notices.push({ kind: 'drawer', run: name, col: bank.column, ix, from: old_pull, to: safe });
      }
    }
    results.push([name, run, x, y, rot]);
  }
  const final = [], done = [];
  for (const m of results) {
    const [name, run, x, y, rot] = m, others = blockers(results, name, base, fillers);
    for (const n of results) if (n[0] !== name) others.push(...active_drawer_sweep(n));
    for (const [owner, r] of done) if (owner !== name) others.push(r);
    const wanted = +(run.door_open_angle || 0), dc = new Set([...(run.enable_drawers ? (run.drawer_banks || []).map(b => b.column | 0) : []), ...(run._blind_cols || []), ...(run._appliance_cols || [])]), angles = {};
    if (wanted > 0 && (run.front_style || 'CLOSED') === 'CLOSED') for (let col = 1; col <= run.door_columns; col++) {
      if (dc.has(col)) continue;
      const safe = safe_angle_column(m, others, col, wanted);
      angles[col] = safe;
      for (const r of door_sweep_rects(m, col, safe)) done.push([name, r]);
      if (safe + rad(.3) < wanted) notices.push({ kind: 'door', run: name, col, from: deg(wanted), to: deg(safe) });
    }
    run._corner_leaf_angles = angles;
    final.push([name, run, x, y, rot]);
  }
  return [final, notices];
}

function corner_raw_with_fillers(d, widths) { return layout_modules_raw({ ...d, _corner_filler_widths: widths }); }

function corner_layout_plan(d0) {
  const d = withDefaults(clone(d0));
  if (!d.corner_smart_enabled || d.layout_shape === 'STRAIGHT') return { fill: {}, notes: [], modules: layout_modules_raw(d) };
  const sides = d.layout_shape === 'L' ? [d.l_corner_side] : ['LEFT', 'RIGHT'];
  const minimum = Math.max(0, +d.corner_min_filler_mm), maximum = Math.max(minimum, +d.corner_max_filler_mm);
  const fillers = {}, notes = [];
  for (const side of sides) {
    const length = side === 'LEFT' ? d.return_left_length : d.return_right_length;
    const avail = Math.max(0, length - d.depth - (2 * d.carcass_thickness + 85));
    const cap = Math.min(maximum, avail), lower = Math.min(minimum, cap);
    if (d.corner_auto_filler) {
      let chosen = cap; const values = [lower];
      for (let c = ceil(lower / 5) * 5; c < cap - .1; c += 5) if (c > lower + .1) values.push(c);
      if (!values.includes(cap)) values.push(cap);
      for (const width of values) {
        const trial = corner_raw_with_fillers(d, { ...fillers, [side]: width });
        const design = trial.map(([nm, u, ux, uy, a]) => {
          u = { ...u, door_open_angle: 0 };
          if (u.enable_drawers) { const tg = drawer_safe_travel_mm(u.drawer_depth); u.drawer_banks = u.drawer_banks.map(b => ({ ...b, pulls: Array(6).fill(tg) })); }
          return [nm, u, ux, uy, a];
        }).filter(m => m[0] === 'MAIN' || m[0] === 'RETURN_' + side);
        if (!problems(design, d, { [side]: width }).length) { chosen = width; break; }
      }
      fillers[side] = round(chosen, 3);
    } else {
      const wanted = +d['corner_manual_' + side.toLowerCase() + '_mm'];
      fillers[side] = round(Math.min(Math.max(0, wanted), cap), 3);
      if (fillers[side] + .01 < wanted) notes.push({ kind: 'cap', side });
    }
  }
  const [mods, clamps] = enforce(corner_raw_with_fillers(d, fillers), d, fillers);
  return { fill: fillers, notes: notes.concat(clamps), modules: mods };
}

/* Continuous rear/side-wall backsplash for L and U (ported from the add-on). */
function layout_backsplash_segments(d) {
  const shape = d.layout_shape || 'STRAIGHT';
  if (shape === 'STRAIGHT' || !d.include_backsplash || !FLOOR_TYPES.has(d.cabinet_type)) return [];
  const w = d.width, dep = d.depth, thick = d.backsplash_thickness, height = d.backsplash_height;
  const z = d.installation_height + d.height + (d.include_countertop ? d.countertop_thickness : 0) + height / 2;
  const segs = [['Main Rear Wall', [0, dep / 2 - thick / 2, z], [w, thick, height], w]];
  for (const side of shape === 'L' ? [d.l_corner_side] : ['LEFT', 'RIGHT']) {
    const length = side === 'LEFT' ? d.return_left_length : d.return_right_length;
    const xmin = side === 'LEFT' ? -w / 2 : w / 2 - thick, x = xmin + thick / 2, y0 = -length + dep / 2, y1 = dep / 2 - thick;
    segs.push([title(side) + ' Side Wall', [x, (y0 + y1) / 2, z], [thick, y1 - y0, height], y1 - y0]);
  }
  return segs;
}

function calculate_layout(d) {
  d = withDefaults(clone(d));
  const plan = corner_layout_plan(d), mods = plan.modules, all = [];
  const totals = { panel_cost: 0, edge_m: 0, edge_cost: 0, waste_cost: 0, total: 0, panel_area_m2: 0 };
  for (const [name, run] of mods) {
    const [, parts, sub] = calculate(run);
    for (const p of parts) all.push({ ...p, run: name, name: mods.length > 1 ? title(name.replace('_', ' ')).replace(/ (\w)/, (m, c) => ' ' + c.toUpperCase()) + ' | ' + p.name : p.name });
    for (const k in totals) totals[k] += sub[k];
  }
  for (const [label, , , len] of layout_backsplash_segments(d)) {
    const area = len * d.backsplash_height / 1e6, cost = area * d.backsplash_rate, waste = cost * d.waste_percent / 100;
    all.push({ category: 'BACKSPLASH', name: label + ' | Backsplash Panel', run: 'BACKSPLASH', length_mm: round(len, 3), width_mm: d.backsplash_height,
      thickness_mm: d.backsplash_thickness, pieces: 1, unit: 'm2', quantity: round(area, 4), unit_rate: d.backsplash_rate,
      material_cost: round(cost, 2), edge_m: 0, edge_sides: '' });
    totals.panel_cost += cost; totals.panel_area_m2 += area; totals.waste_cost += waste; totals.total += cost + waste;
  }
  for (const k in totals) totals[k] = round(totals[k], k === 'edge_m' || k === 'panel_area_m2' ? 3 : 2);
  plan.backsplash = layout_backsplash_segments(d);
  return { plan, parts: all, totals };
}

/* ---------- tall units (new; not in the add-on) ----------
 * Storage tower, fridge housing or oven tower placed after an OPEN end of a run.
 * Each is built from ordinary engine cabinets so the BOQ uses the same rules. */
const TALL_POSITIONS = { STRAIGHT: ['MAIN_L', 'MAIN_R'], L_LEFT: ['MAIN_R', 'RET_L'], L_RIGHT: ['MAIN_L', 'RET_R'], U: ['RET_L', 'RET_R'] };
function tall_positions(d) { return d.layout_shape === 'U' ? TALL_POSITIONS.U : d.layout_shape === 'L' ? TALL_POSITIONS['L_' + d.l_corner_side] : TALL_POSITIONS.STRAIGHT; }
function mkpart(category, name, cut_l, cut_w, thick, qty, edges, rate) {
  const edge_len = edges.reduce((s, x) => s + (x === 'L1' || x === 'L2' ? cut_l : cut_w), 0) / 1000 * qty, area = cut_l * cut_w * qty / 1e6;
  return { category, name, length_mm: round(cut_l, 3), width_mm: round(cut_w, 3), thickness_mm: thick, pieces: qty, unit: 'm2', quantity: round(area, 4),
    unit_rate: rate, material_cost: round(area * rate, 2), edge_m: round(edge_len, 4), edge_sides: edges.join(',') };
}
function calculate_talls(d0, talls) {
  const d = withDefaults(clone(d0)), avail = tall_positions(d), modules = [], extras = [], notes = [], parts = [];
  const totals = { panel_cost: 0, edge_m: 0, edge_cost: 0, waste_cost: 0, total: 0, panel_area_m2: 0 };
  const w = d.width, dep = d.depth, t = d.carcass_thickness, used = new Set();
  const base = { ...d, layout_shape: 'STRAIGHT', enable_drawers: false, drawer_banks: [], include_sink: false, _sink_specs: [], include_countertop: false,
    include_backsplash: false, appliances: [], _appliance_cols: [], _blind_cols: [], _corner_filler_width_mm: 0, door_open_angle: d.door_open_angle,
    horizontal_divisions: 0, door_rows: 1, cabinet_type: 'BASE' };
  (talls || []).forEach((sp, i) => {
    const n = i + 1, tw = +sp.width, H = +sp.height, kind = sp.kind || 'STORAGE';
    if (!avail.includes(sp.pos) || used.has(sp.pos)) { notes.push({ kind: 'tall_pos', n }); return; }
    used.add(sp.pos);
    let x = 0, y = 0, a = 0;
    if (sp.pos === 'MAIN_R') x = w / 2 + tw / 2;
    else if (sp.pos === 'MAIN_L') x = -w / 2 - tw / 2;
    else if (sp.pos === 'RET_L') { x = -w / 2 + dep / 2; y = -d.return_left_length + dep / 2 - tw / 2; a = PI / 2; }
    else { x = w / 2 - dep / 2; y = -d.return_right_length + dep / 2 - tw / 2; a = -PI / 2; }
    const cols = tw >= 700 ? 2 : 1, tag = 'TALL_' + n, mods = [], extra = [];
    const cfg = o => ({ ...base, door_columns: cols, vertical_divisions: cols - 1, width: tw, ...o });
    if (kind === 'STORAGE') {
      mods.push([tag, cfg({ cabinet_type: 'TALL', height: H, door_rows: 2, horizontal_divisions: 4 })]);
    } else if (kind === 'FRIDGE') {
      const niche = +sp.niche || 1850, up = H - niche;
      if (up < 250) throw E(`ตู้สูงที่ ${n}: ช่องตู้เย็นสูงเกินตู้ เหลือตู้บนไม่ถึง 250 มม.`, `Tall unit ${n}: fridge niche leaves under 250 mm for the top cupboard`);
      mods.push([tag, cfg({ width: tw - 2 * t, base_type: 'NONE', installation_height: niche, height: up })]);
      extra.push(['Fridge Housing Side Panel', H, dep, 2, [-tw / 2 + t / 2, 0, H / 2], [t, dep, H]]);
      extra.push(['Fridge Housing Side Panel', H, dep, 0, [tw / 2 - t / 2, 0, H / 2], [t, dep, H]]);
    } else {
      const low = +sp.lower || 800, niche = +sp.niche || 600, up = H - low - niche;
      if (up < 250) throw E(`ตู้สูงที่ ${n}: ช่องเตาอบสูงเกินตู้ เหลือตู้บนไม่ถึง 250 มม.`, `Tall unit ${n}: oven niche leaves under 250 mm for the top cupboard`);
      mods.push([tag, cfg({ door_columns: 1, vertical_divisions: 0, height: low, enable_drawers: true, drawer_banks: [{ run: 'MAIN', column: 1, count: 2, hardware: 'HANDLE', pulls: [0, 0, 0, 0, 0, 0] }] })]);
      mods.push([tag + '_UP', cfg({ door_columns: 1, vertical_divisions: 0, base_type: 'NONE', installation_height: low + niche, height: up })]);
      extra.push(['Oven Niche Side Panel', niche, dep, 2, [-tw / 2 + t / 2, 0, low + niche / 2], [t, dep, niche]]);
      extra.push(['Oven Niche Side Panel', niche, dep, 0, [tw / 2 - t / 2, 0, low + niche / 2], [t, dep, niche]]);
    }
    const label = `Tall ${n}`;
    for (const [nm, run] of mods) {
      const [, ps, sub] = calculate(run);
      for (const p of ps) parts.push({ ...p, run: tag, name: label + ' | ' + p.name });
      for (const k in totals) totals[k] += sub[k];
      modules.push([nm, run, x, y, a]);
    }
    const rate = { WOOD: d.wood_laminate_rate, COLOR: d.color_laminate_rate }[d.carcass_finish];
    for (const [nm, L, W, q, c, s] of extra) {
      extras.push({ pose: [x, y, a], local: c, size: s });
      if (!q) continue;
      const p = mkpart('CARCASS', nm, L, W, t, q, ['L1'], rate);
      parts.push({ ...p, run: tag, name: label + ' | ' + p.name });
      const waste = p.material_cost * d.waste_percent / 100, edge = p.edge_m * d.edge_rate;
      totals.panel_cost += p.material_cost; totals.edge_m += p.edge_m; totals.edge_cost += edge; totals.waste_cost += waste;
      totals.total += p.material_cost + edge + waste; totals.panel_area_m2 += p.quantity;
    }
  });
  for (const k in totals) totals[k] = round(totals[k], k === 'edge_m' || k === 'panel_area_m2' ? 3 : 2);
  return { plan: { modules, fill: {}, notes, extras }, parts, totals };
}

/* Workshop labels: unit letter + run letter + running number, e.g. BM-01. */
function assign_codes(parts, unit) {
  const RL = { MAIN: 'M', RETURN_LEFT: 'L', RETURN_RIGHT: 'R', BACKSPLASH: 'S' }, n = {};
  for (const p of parts) {
    if (p.unit !== 'm2' || p.quantity <= 0) continue;
    const rl = RL[p.run] || (String(p.run).startsWith('TALL_') ? 'T' + p.run.split('_')[1] : 'X'), k = unit + rl;
    n[k] = (n[k] || 0) + 1; p.code = `${k}-${String(n[k]).padStart(2, '0')}`;
  }
  return parts;
}

/* MaxRects, best-short-side-fit, 90° rotation allowed (no grain direction yet). */
function maxrects_find(free, w, h, lock) {
  let best = null;
  for (const r of free) for (const [ww, hh, rot] of lock ? [[w, h, false]] : [[w, h, false], [h, w, true]]) {
    if (ww <= r.w + 1e-6 && hh <= r.h + 1e-6) {
      const score = Math.min(r.w - ww, r.h - hh) * 1e6 + Math.max(r.w - ww, r.h - hh);
      if (!best || score < best.score) best = { x: r.x, y: r.y, rot, score };
    }
  }
  return best;
}
function maxrects_split(s, u) {
  const next = [];
  for (const r of s.free) {
    if (u.x >= r.x + r.w || u.x + u.w <= r.x || u.y >= r.y + r.h || u.y + u.h <= r.y) { next.push(r); continue; }
    if (u.x > r.x) next.push({ x: r.x, y: r.y, w: u.x - r.x, h: r.h });
    if (u.x + u.w < r.x + r.w) next.push({ x: u.x + u.w, y: r.y, w: r.x + r.w - u.x - u.w, h: r.h });
    if (u.y > r.y) next.push({ x: r.x, y: r.y, w: r.w, h: u.y - r.y });
    if (u.y + u.h < r.y + r.h) next.push({ x: r.x, y: u.y + u.h, w: r.w, h: r.y + r.h - u.y - u.h });
  }
  s.free = next.filter((a, i) => !next.some((b, j) => j !== i && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h && (j < i || a.w !== b.w || a.h !== b.h || a.x !== b.x || a.y !== b.y)));
}
/* ---------- sheet nesting (new; not in the Blender add-on) ---------- */
/* Practical estimate for buying boards, not a CNC-optimised nest. */
function nest(parts, opt = {}) {
  const SW = opt.sheetW || 2440, SH = opt.sheetH || 1220, kerf = opt.kerf ?? 4, trim = opt.trim ?? 10;
  const UW = SW - 2 * trim, UH = SH - 2 * trim, groups = {};
  const KEY = { CARCASS: 'โครงตู้', DRAWER_BOX: 'โครงตู้', DOOR: 'หน้าบาน', DRAWER_FRONT: 'หน้าบาน', BACK: 'แผ่นหลัง/พื้นลิ้นชัก', DRAWER_BOTTOM: 'แผ่นหลัง/พื้นลิ้นชัก' };
  /* Grain lock: wood-grain faces keep their length along the sheet's long side
   * (grain runs along part length: side panels and doors vertical, tops along
   * the run). Locked parts are never rotated. */
  const LOCK = { 'โครงตู้': !!opt.grainCarcass, 'หน้าบาน': !!opt.grainDoor };
  for (const p of parts) {
    const g = KEY[p.category]; if (!g || p.unit !== 'm2' || p.quantity <= 0) continue;
    const key = `${g} ${p.thickness_mm} มม.`, lock = !!LOCK[g];
    (groups[key] ||= []); groups[key].group = g; groups[key].thick = p.thickness_mm; groups[key].lock = lock;
    for (let i = 0; i < p.pieces; i++) {
      let a, b;
      if (lock) { a = p.length_mm; b = p.width_mm; }
      else { a = Math.max(p.length_mm, p.width_mm); b = Math.min(p.length_mm, p.width_mm); if (a > UW || b > UH) { if (a <= UH && b <= UW) [a, b] = [b, a]; } }
      groups[key].push({ w: a, h: b, name: p.name, code: p.code, lock, over: a > UW || b > UH });
    }
  }
  const out = [];
  for (const key in groups) {
    const items = groups[key].filter(i => !i.over).sort((p, q) => q.w * q.h - p.w * p.h);
    const sheets = [];
    for (const it of items) {
      let best = null;
      for (const s of sheets) { const f = maxrects_find(s.free, it.w + kerf, it.h + kerf, it.lock); if (f && (!best || f.score < best.f.score)) best = { s, f }; }
      if (!best) { const s = { free: [{ x: 0, y: 0, w: UW + kerf, h: UH + kerf }], rects: [] }; sheets.push(s); best = { s, f: maxrects_find(s.free, it.w + kerf, it.h + kerf, it.lock) }; }
      const { s, f } = best, w = f.rot ? it.h : it.w, h = f.rot ? it.w : it.h;
      s.rects.push({ ...it, w, h, x: f.x, y: f.y, rot: f.rot });
      maxrects_split(s, { x: f.x, y: f.y, w: w + kerf, h: h + kerf });
    }
    const used = items.reduce((s, i) => s + i.w * i.h, 0);
    out.push({ key, group: groups[key].group, thick: groups[key].thick, lock: groups[key].lock, sheets, count: sheets.length, util: sheets.length ? used / (sheets.length * SW * SH) : 0, oversize: groups[key].filter(i => i.over), UW, UH, trim });
  }
  return out;
}

const api = { blind_panels, calculate_talls, tall_positions, assign_codes, active_sink_specs, sink_cutout_info, layout_backsplash_segments, closed_columns, appliance_columns, blind_columns, DEFAULTS, RATES, calculate, calculate_layout, corner_layout_plan, layout_modules_raw, compartment_geometry,
  drawer_specs: d => [...drawer_specs(d)], drawer_safe_travel_mm, drawer_bank_columns, fixed_horizontal_bays,
  body_height, support_height, effective_base_type, nest, problems, enforce };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BOQ = api;
})(typeof window !== 'undefined' ? window : globalThis);
