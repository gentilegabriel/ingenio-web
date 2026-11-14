import { drawScope, drawTriangle } from './osciloscopio-suricat.js';

const capacity = 80;
const syncSeconds = 10;
const transferSeconds = 16;
const get = id => document.getElementById(id);
const loads = [...document.querySelectorAll('.gen input[data-pf]')];
const format = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
let model;

function log(message) {
  model.events.unshift(model.time + ' s · ' + message);
  model.events = model.events.slice(0, 10);
}

function demand() {
  let p = 0;
  let q = 0;
  for (const load of loads) {
    if (!load.checked) continue;
    const kw = Number(load.value);
    p += kw;
    q += Number(load.dataset.kvar ?? kw * Math.tan(Math.acos(Number(load.dataset.pf))));
  }
  const apparent = Math.hypot(p, q);
  return { p, q, apparent, pf: apparent ? p / apparent : null };
}

function startG2(reason) {
  model.spin2 = true;
  moveTo('Arranque de G2', 6, reason + ' G2 arranca con su interruptor abierto.');
}

function automaticSupport(load) {
  if (!model.grid && model.g1 && !model.spin2 && !model.tripped &&
      (load.p >= capacity * .8 || load.apparent >= 80)) {
    startG2('G1 alcanzó el 80 % de su capacidad activa o aparente.');
  }
}

function moveTo(phase, delay, message) {
  if (model.phase !== phase) model.phase = phase;
  model.delay = delay;
  log(message);
}

function switchGrid() {
  model.grid = !model.grid;
  if (model.grid) {
    moveTo('Verificando retorno', 4, 'Red disponible. Esperando estabilidad.');
  } else if (model.g1) {
    model.red = false;
    model.spin2 = model.g2;
    model.share = 1;
    moveTo('En isla', 0, 'Red aislada. Los grupos mantienen la barra.');
  } else {
    model.red = false;
    model.g2 = false;
    model.spin2 = false;
    model.tripped = false;
    model.spin1 = true;
    moveTo('Arranque de G1', 6, 'Corte de red. Q-Red abierto. Arranca G1.');
  }
  render();
}

function protection(load) {
  const groups = Number(model.g1) + Number(model.g2);
  if (!model.red && groups > 0 && (load.p > groups * capacity || load.apparent > groups * 100)) {
    model.g1 = model.g2 = false;
    model.spin2 = false;
    model.tripped = true;
    moveTo('Protección por sobrecarga', 0, 'Se abre la salida de generación. La línea queda sin suministro.');
  }
}

function tick() {
  model.time++;
  model.lastTick = performance.now();
  model.transient *= 0.53;
  if (model.delay > 0 && --model.delay === 0) {
    switch (model.phase) {
      case 'Arranque de G1':
        moveTo('Estabilización de G1', 5, 'G1 gira en régimen. Se verifica tensión y frecuencia.');
        break;
      case 'Estabilización de G1':
        model.g1 = true;
        moveTo('En isla', 0, 'Q-G1 cerrado. La barra recibe energía de G1.');
        break;
      case 'Arranque de G2':
        moveTo('Sincronizando G2', syncSeconds, 'G2 compara tensión, frecuencia y fase con la barra.');
        break;
      case 'Sincronizando G2':
        model.g2 = true;
        moveTo('G1 y G2 en paralelo', 0, 'Q-G2 cerrado. Ambos grupos comparten la carga.');
        break;
      case 'Verificando retorno':
        if (model.g1 && get('mode').value === 'closed') {
          moveTo('Sincronizando retorno', syncSeconds, 'Se compara la red con la barra antes del cierre.');
        } else if (model.g1) {
          model.g1 = model.g2 = false;
          moveTo('Transferencia abierta', 2, 'Q-G1 y Q-G2 abiertos. La línea queda sin suministro durante la transición.');
        } else {
          recoverGrid();
        }
        break;
      case 'Sincronizando retorno':
        model.red = true;
        model.share = 1;
        moveTo('Paralelo breve con red', transferSeconds, 'Q-Red cerrado. Se transfiere la potencia gradualmente.');
        break;
      case 'Transferencia abierta':
      case 'Paralelo breve con red':
        recoverGrid();
        break;
      case 'Enfriamiento':
        model.spin1 = model.spin2 = false;
        moveTo('En red', 0, 'Grupos detenidos.');
        break;
    }
  }
  if (model.phase === 'Paralelo breve con red') model.share = model.delay / transferSeconds;
  const load = demand();
  protection(load);
  automaticSupport(load);
  const generating = (model.g1 || model.g2) ? load.p * model.share : 0;
  model.energy += generating / 3600;
  model.fuel += (3 * (Number(model.spin1) + Number(model.spin2)) + 0.24 * generating) / 3600;
  if (!model.red && !model.g1 && !model.g2) model.outage++;
  render();
}

function recoverGrid() {
  model.red = true;
  model.g1 = model.g2 = false;
  model.tripped = false;
  model.share = 1;
  if (model.spin1 || model.spin2) {
    moveTo('Enfriamiento', 6, 'La red toma toda la carga. Los grupos se enfrían.');
  } else {
    moveTo('En red', 0, 'Q-Red cerrado. Red alimentando la línea.');
  }
}

function meter(id, voltage, apparent) {
  const amp = voltage > 0 ? apparent * 1000 / (Math.sqrt(3) * voltage) : 0;
  get(id).textContent = 'TV ' + format.format(voltage) + ' V · TI ' + format.format(amp) + ' A';
}

function breaker(id, label, closed) {
  const element = get(id);
  element.dataset.closed = String(closed);
  element.textContent = label + ' · ' + (closed ? 'Cerrado' : 'Abierto');
}

function signals(running1, running2, groups, seconds = model.delay) {
  const syncing = model.phase === 'Sincronizando G2' || model.phase === 'Sincronizando retorno';
  const island = groups > 0 && !model.red;
  const frequency = island ? 50 - model.transient * .025 : 50;
  const voltage = island ? 400 - model.transient * .27 : 400;
  const bus = { name: 'Barra', voltage: island || model.red ? voltage : 0, frequency, phase: 0 };
  const grid = { name: 'Red', voltage: model.grid ? 400 : 0, frequency: 50, phase: 0 };
  const g1 = { name: 'G1', voltage: running1 ? (model.g1 ? voltage : 400) : 0, frequency: model.g1 ? frequency : 50, phase: 0 };
  const g2 = { name: 'G2', voltage: running2 ? (model.g2 ? voltage : 400) : 0, frequency: model.g2 ? frequency : 50, phase: 0 };
  const incoming = model.phase === 'Sincronizando G2' ? g2 : grid;
  if (syncing) {
    const progress = seconds / syncSeconds;
    const reference = incoming === grid ? grid : bus;
    const adjusting = incoming === grid ? [bus, g1, g2].filter(source => source.voltage && (source === bus || (source === g1 ? model.g1 : model.g2))) : [g2];
    for (const signal of adjusting) {
      signal.voltage = reference.voltage + 18 * progress;
      signal.frequency = reference.frequency + .3 * progress;
      signal.phase = 110 * progress;
    }
  }
  return { bus, grid, g1, g2, incoming: syncing ? incoming : null };
}

function splitGeneration(load) {
  if (!model.g2) return [model.g1 ? 1 : 0, 0];
  const maximum = Math.min(1, capacity / (load.p * model.share), 100 / (load.apparent * model.share));
  const first = Math.max(1 - maximum, Math.min(maximum, model.operatorShare));
  return [first, 1 - first];
}

function renderScope(signal = null) {
  const remaining = Math.max(0, model.delay - (performance.now() - model.lastTick) / 1000);
  signal ??= signals(model.spin1 && model.phase !== 'Arranque de G1',
    model.spin2 && model.phase !== 'Arranque de G2', Number(model.g1) + Number(model.g2), remaining);
  const active = [signal.grid, signal.g1, signal.g2].filter(source => source.voltage > 0);
  drawScope(get('scope'), active, Number(get('scope-phase').value), Boolean(signal.incoming));
}

function render() {
  const load = demand();
  const total = load.p;
  const groups = Number(model.g1) + Number(model.g2);
  const generating = groups ? total * model.share : 0;
  const live = model.red || groups > 0;
  const shares = splitGeneration(load);
  const running1 = model.spin1 && model.phase !== 'Arranque de G1';
  const running2 = model.spin2 && model.phase !== 'Arranque de G2';
  get('red').textContent = model.grid ? 'Simular corte' : 'Restablecer red';
  get('g2').disabled = model.grid || !model.g1 || model.spin2 || model.tripped;
  get('grid-status').textContent = model.grid ? 'Disponible' : 'Sin tensión';
  get('motor-status').textContent = running1 ? 'En régimen · 1.500 rpm' : model.spin1 ? 'Arrancando' : 'Detenido';
  get('second-status').textContent = running2 ? 'En régimen · 1.500 rpm' : model.spin2 ? 'Arrancando' : 'Detenido';
  get('rotor1').dataset.spin = String(model.spin1);
  get('rotor2').dataset.spin = String(model.spin2);
  const explanations = {
    'En red': 'La red alimenta el edificio.',
    'Arranque de G1': 'La red se cortó. El edificio queda sin suministro mientras arranca G1.',
    'Estabilización de G1': 'G1 está girando y estabiliza su salida antes de tomar la carga.',
    'En isla': 'La generación alimenta el edificio con la red aislada.',
    'Arranque de G2': 'G1 mantiene la carga mientras arranca el segundo grupo.',
    'Sincronizando G2': 'G2 ajusta su señal para acoplarse a G1.',
    'G1 y G2 en paralelo': 'Los dos grupos comparten la demanda.',
    'Verificando retorno': 'La red volvió. Se espera su estabilidad antes de transferir.',
    'Sincronizando retorno': 'Los grupos siguen alimentando el edificio mientras se alinea la red.',
    'Paralelo breve con red': 'La red toma gradualmente la carga. El edificio sigue con suministro.',
    'Transferencia abierta': 'La línea queda sin suministro durante el cambio a red.',
    'Enfriamiento': 'La red ya tomó la carga. Los motores giran descargados antes de detenerse.',
    'Protección por sobrecarga': 'La salida de los grupos se abre y la carga queda sin suministro.'
  };
  get('sequence').textContent = model.phase + ' · ' + explanations[model.phase];
  const nextStep = {
    'En red': 'Tocá «Simular corte» para probar el respaldo.',
    'En isla': 'Tildá Climatización en Cargas del edificio y mirá cómo sube la demanda.',
    'G1 y G2 en paralelo': 'Mové una barra de aporte para repartir la potencia, o tocá «Restablecer red».',
    'Protección por sobrecarga': 'Reducí la demanda y restablecé la red, o reiniciá la demo.'
  }[model.phase];
  const guide = get('gen-guide-state');
  const guideText = explanations[model.phase] + (nextStep ? ' ' + nextStep : '');
  if (guide.textContent !== guideText) guide.textContent = guideText;
  get('bus').dataset.live = String(live);
  get('bus-status').textContent = live ? '400 V · 50 Hz' : 'Sin tensión';
  breaker('q-grid', 'Q-Red', model.red);
  breaker('q-g1', 'Q-G1', model.g1);
  breaker('q-g2', 'Q-G2', model.g2);
  breaker('q-load', 'Q-Carga', true);
  const signal = signals(running1, running2, groups);
  get('bus-status').textContent = live ? format.format(signal.bus.voltage) + ' V · ' + format.format(signal.bus.frequency) + ' Hz' : 'Sin tensión';
  meter('meter-grid', signal.grid.voltage, model.red ? load.apparent * (groups ? 1 - model.share : 1) : 0);
  meter('meter-g1', signal.g1.voltage, model.g1 ? load.apparent * model.share * shares[0] : 0);
  meter('meter-g2', signal.g2.voltage, model.g2 ? load.apparent * model.share * shares[1] : 0);
  meter('meter-load', signal.bus.voltage, live ? load.apparent : 0);
  get('sync').textContent = signal.incoming
    ? 'Entrando en sincronismo · ' + model.delay + ' s · ΔV ' + format.format(Math.abs(signal.incoming.voltage - signal.bus.voltage)) +
      ' V · Δf ' + format.format(Math.abs(signal.incoming.frequency - signal.bus.frequency)) +
      ' Hz · Δfase ' + format.format(Math.abs(signal.incoming.phase - signal.bus.phase)) + '°'
    : model.phase === 'Paralelo breve con red' || model.g2
      ? 'Fuentes acopladas a la misma barra.'
      : 'Sin maniobra de sincronismo en curso.';
  const active = [signal.grid, signal.g1, signal.g2].filter(source => source.voltage > 0);
  renderScope(signal);
  get('scope-readings').textContent = active.length
    ? active.map(source => source.name + ' ' + format.format(source.voltage) + ' V · ' + format.format(source.frequency) + ' Hz').join(' / ')
    : 'Sin tensión en las fuentes.';
  const gridPower = model.red ? total - generating : 0;
  for (const [index, fraction] of shares.entries()) {
    const group = index + 1;
    const power = generating * fraction;
    const source = signal['g' + group];
    get('g' + group + '-kw').textContent = format.format(power) + ' kW';
    get('g' + group + '-power').value = power;
    get('g' + group + '-electric').textContent =
      (source.voltage ? format.format(source.frequency) + ' Hz · ' + format.format(source.frequency * 30) + ' rpm' : 'Sin tensión') +
      ' · ' + format.format(load.apparent * (groups ? model.share : 0) * fraction) + ' kVA';
    const control = get('share' + group);
    control.disabled = !model.g2 || model.grid || total === 0;
    control.value = Math.round(fraction * 100);
    get('share' + group + '-value').textContent = control.disabled ? '—' : control.value + ' %';
  }
  const gridShare = model.red ? (groups ? 1 - model.share : 1) : 0;
  get('grid-transfer').value = gridShare * 100;
  get('groups-transfer').value = groups ? model.share * 100 : 0;
  get('grid-kw').textContent = format.format(gridPower) + ' kW';
  get('groups-kw').textContent = format.format(generating) + ' kW';
  get('transfer-note').textContent = model.phase === 'Paralelo breve con red'
    ? 'Devolviendo carga a la red · ' + model.delay + ' s restantes · suministro continuo'
    : model.g2 && !model.grid
      ? 'Ajustá cualquiera de los dos controles. El otro grupo compensa dentro de su capacidad.'
      : live ? 'La barra tiene suministro.' : 'La barra está sin suministro.';
  get('load-status').textContent = 'Demanda seleccionada: ' + format.format(total) + ' kW';
  get('active-power').textContent = format.format(load.p) + ' kW';
  get('reactive-power').textContent = format.format(load.q) + ' kvar';
  get('apparent-power').textContent = format.format(load.apparent) + ' kVA';
  get('power-factor').textContent = load.pf === null ? '—' : format.format(load.pf) +
    (load.q > .01 ? ' inductivo' : load.q < -.01 ? ' capacitivo' : '');
  drawTriangle(get('triangle'), load);
  get('kw').textContent = format.format(generating) + ' kW';
  get('percent').textContent = format.format(groups ? generating * 100 / (groups * capacity) : 0) + ' %';
  get('hz').textContent = running1 || running2 ? format.format((running1 ? signal.g1 : signal.g2).frequency) + ' Hz' : '—';
  get('kwh').textContent = format.format(model.energy) + ' kWh';
  get('fuel').textContent = format.format(model.fuel) + ' L';
  get('outage').textContent = model.outage + ' s';
  const events = get('events');
  if (events.dataset.last !== model.events[0]) {
    events.dataset.last = model.events[0];
    events.replaceChildren(...model.events.map(message => {
      const item = document.createElement('li');
      item.textContent = message;
      return item;
    }));
  }
}

function reset() {
  model = { grid: true, red: true, g1: false, g2: false, spin1: false, spin2: false, share: 1, operatorShare: .5, lastTick: performance.now(),
    phase: 'En red', delay: 0, tripped: false, transient: 0, previousDemand: 0, time: 0, energy: 0, fuel: 0, outage: 0, events: [] };
  loads.forEach(load => { load.checked = load.defaultChecked; });
  model.previousDemand = demand().p;
  log('Red disponible. Cargas conectadas a la barra.');
  render();
}

get('red').addEventListener('click', switchGrid);
get('reset').addEventListener('click', reset);
get('g2').addEventListener('click', () => {
  startG2('Arranque manual.');
  render();
});
loads.forEach(load => load.addEventListener('change', () => {
  const next = demand();
  if (!model.red && (model.g1 || model.g2)) {
    model.transient += (next.p - model.previousDemand) / (Number(model.g1) + Number(model.g2));
  }
  model.previousDemand = next.p;
  protection(next);
  automaticSupport(next);
  render();
}));
for (const group of [1, 2]) {
  get('share' + group).addEventListener('input', event => {
    if (event.target.disabled) return;
    const fraction = Number(event.target.value) / 100;
    model.operatorShare = group === 1 ? fraction : 1 - fraction;
    render();
  });
}
get('scope-phase').addEventListener('change', render);
window.addEventListener('resize', render);
reset();
setInterval(tick, 1000);
function animateSync() {
  if (model.phase.startsWith('Sincronizando')) renderScope();
  requestAnimationFrame(animateSync);
}
requestAnimationFrame(animateSync);
