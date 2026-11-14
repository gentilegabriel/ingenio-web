const demoCapacity = 4;
const motorPowerKw = 7;
const standbyPowerKw = 0.1;
const motionSecondsPerFloor = 2;
const minutesPerTick = 4;

function estimateEnergy(cars, previousFloors) {
  const moving = cars.filter((car, index) => car.floor !== previousFloors[index]).length;
  return {
    powerKw: cars.length * standbyPowerKw + moving * motorPowerKw,
    energyKwh: (cars.length * standbyPowerKw * minutesPerTick * 60 +
      moving * motorPowerKw * motionSecondsPerFloor) / 3600
  };
}

const parkingWeight = 2.2;

function exampleDay(day) {
  const morningFloor = day % 7 < 4 ? 9 : 7;
  return {
    manana: [morningFloor, morningFloor, 8, 10, 6, 3, day % 11],
    tarde: [0, 0, 0, 0, 0, 6, day % 11],
    dia: [0, 0, 4, day % 11],
    noche: [0, day % 11]
  };
}

function summarizeDays(days, period, schedule) {
  const sample = days.slice(-period);
  const counts = Array(11).fill(0);
  for (const day of sample) {
    for (const floor of day[schedule]) counts[floor]++;
  }
  const ranking = counts.map((calls, floor) => ({ floor, calls }))
    .sort((a, b) => b.calls - a.calls || a.floor - b.floor);
  // Estimate the distance to the nearest of the two idle cars.
  const cost = floor => counts.reduce((total, calls, origin) =>
    total + calls * Math.min(origin, Math.abs(origin - floor)), 0) / sample.length + floor * parkingWeight;
  const parking = counts.reduce((best, _, floor) => cost(floor) < cost(best) ? floor : best, 0);
  return { days: sample.length, ranking, parking };
}

const floorName = floor => floor === 0 ? 'PB' : 'piso ' + floor;
const carName = (scenario, car) => scenario.cars.indexOf(car) === 0 ? 'A' : 'B';

function assignCall(scenario, call) {
  const candidates = scenario.cars.map(car => {
    const last = car.queue.at(-1);
    const nextFloor = last ? last.destination : car.floor;
    const distance = Math.abs(nextFloor - call.origin);
    return { car, distance, score: distance + car.queue.length * 12 };
  }).sort((a, b) => a.score - b.score);
  const available = candidates.find(({ car }) => car.load < demoCapacity);
  if (!available) return;
  call.assigned = true;
  const { car } = available;
  scenario.events.push({
    title: 'Llamada ' + call.number + ' · ' + floorName(call.origin) + ' → ' + floorName(call.destination),
    detail: 'Asigno la cabina ' + carName(scenario, car) +
      (candidates.some(item => item.car.load >= demoCapacity)
        ? '. La otra cabina está llena y sigue hacia su destino.'
        : ' según la distancia y las tareas pendientes.')
  });
  car.queue.push({ call, destination: call.destination, phase: 'pickup' });
}

function advance(scenario, time) {
  for (const call of scenario.calls) {
    if (!call.assigned && !call.pickedUp) assignCall(scenario, call);
  }
  for (const car of scenario.cars) {
    if (car.door > 0) {
      car.door--;
      continue;
    }
    const task = car.queue[0];
    if (!task) {
      if (car === scenario.cars[1] && scenario.cars.every(item => item.queue.length === 0 && item.door === 0) && car.floor !== scenario.parking) {
        car.floor += Math.sign(scenario.parking - car.floor);
        scenario.floors++;
        scenario.emptyFloors++;
      }
      continue;
    }
    const { call } = task;
    const target = task.phase === 'pickup' ? call.origin : call.destination;
    if (car.floor !== target) {
      car.floor += Math.sign(target - car.floor);
      scenario.floors++;
      if (!car.occupied) scenario.emptyFloors++;
      if (car.load === demoCapacity && car.floor !== target &&
          scenario.calls.some(waiting => !waiting.pickedUp && waiting.origin === car.floor)) {
        scenario.events.push({
          title: 'Cabina ' + carName(scenario, car) + ' · completa',
          detail: 'Pasa de largo por ' + floorName(car.floor) + '. La llamada sigue encendida hasta que una cabina recoja al pasajero.'
        });
      }
    }
    if (car.floor !== target) continue;
    const name = 'Cabina ' + carName(scenario, car);
    if (task.phase === 'dropoff') {
      car.door = 2;
      scenario.events.push({ title: name + ' · destino', detail: 'Abre puertas en ' + floorName(car.floor) + '. Llamada ' + call.number + ' completada.' });
      car.occupied = false;
      car.load = 0;
      scenario.completed++;
      call.completed = true;
      car.queue.shift();
    } else {
      car.door = 2;
      scenario.events.push({ title: name + ' · recogida', detail: 'Abre puertas en ' + floorName(car.floor) + ' para la llamada ' + call.number + '. Próximo destino: ' + floorName(call.destination) + '.' });
      call.pickedUp = true;
      car.occupied = true;
      car.load = 1;
      task.phase = 'dropoff';
      scenario.wait += time - call.time;
      scenario.picked++;
    }
  }
}


const panel = document.createElement('article');
panel.className = 'sim-panel';
panel.innerHTML = `
    <dl class="sim-energy" aria-label="Indicadores eléctricos estimados">
      <div><dt>Potencia del momento</dt><dd id="sim-power"></dd></div>
      <div><dt>Energía acumulada</dt><dd id="sim-energy"></dd></div>
    </dl>
    <p class="sim-note">Modelo de la demo: 7 kW adicionales por motor en marcha, 0,1 kW base por cabina y 2 segundos de movimiento por piso.</p>
    <div class="sim-architecture">
      <div class="sim-roof"><span>PALIER</span><span>CABINA A</span><span>CABINA B</span></div>
      <div class="sim-building">
        ${Array.from({length: 11}, (_, row) => {
          const floor = 10 - row;
          return `<div class="sim-storey" data-floor="${floor}" style="grid-row:${row + 1}">
            <span class="sim-floor">${floor || 'PB'}</span>
            <span class="sim-call-light">
              ${[[1, '↑', 'subir'], [-1, '↓', 'bajar']].map(([direction, arrow, name]) =>
                floor + direction >= 0 && floor + direction <= 10
                  ? `<button type="button" data-direction="${direction}" aria-pressed="false" aria-label="Llamar para ${name} desde ${floorName(floor)}">${arrow}</button>`
                  : '<span></span>').join('')}
            </span>
            <span class="sim-landing"></span><span class="sim-landing"></span>
          </div>`;
        }).join('')}
        <div class="sim-shaft"><span class="sim-cab"><b>A</b><i></i><i></i></span></div>
        <div class="sim-shaft"><span class="sim-cab"><b>B</b><i></i><i></i></span></div>
      </div>
    </div>
    <div class="sim-legend"></div>
    <h4>Llamadas en curso</h4><ul class="sim-llamadas"></ul>
    <dl class="sim-totals">
      <div><dt>Pisos recorridos</dt><dd>0</dd></div>
      <div><dt>Pisos en vacío</dt><dd>0</dd></div>
      <div><dt>Llamadas completadas</dt><dd>0</dd></div>
      <div><dt>Espera media simulada</dt><dd>—</dd></div>
    </dl>
    <div class="sim-chat"><h4>Decisiones de Suricat</h4>
    <div class="sim-chat-log" role="log" aria-label="Actividad de Suricat"></div></div>`;
document.querySelector('#sim-escenarios').append(panel);
const play = document.querySelector('#sim-play');
const period = document.querySelector('#sim-period');
const clock = document.querySelector('#sim-clock');
const summary = document.querySelector('#sim-resumen');
const days = Array.from({ length: 365 }, (_, index) => exampleDay(index));
let scenario;
let time;
let timer;
let lastSlot;

function simulatedMinute() {
  return 7 * 60 + time * minutesPerTick;
}
function trafficSlot() {
  const hour = Math.floor(simulatedMinute() / 60) % 24;
  if (hour >= 6 && hour < 10) return 'manana';
  if (hour >= 17 && hour < 22) return 'tarde';
  return hour < 6 || hour >= 22 ? 'noche' : 'dia';
}
function updateHistory() {
  const slot = trafficSlot();
  const stats = summarizeDays(days, Number(period.value), slot);
  const forecast = summarizeDays(days, 30, slot);
  scenario.parking = forecast.parking;
  document.querySelector('#sim-history-summary').textContent =
    ({manana:'Mañana',dia:'Día',tarde:'Tarde',noche:'Noche'})[slot] + ' · ' + stats.days + ' días';
  document.querySelector('#sim-floor-demand').replaceChildren(...stats.ranking.filter(item => item.calls).slice(0, 4).map(item => {
    const row = document.createElement('li');
    row.textContent = floorName(item.floor) + ' · ' + item.calls + ' llamadas de origen';
    return row;
  }));
  document.querySelector('#sim-parking').textContent =
    'Por el historial de esta franja, la cabina B puede esperar en ' + floorName(forecast.parking) +
    ' cuando ambas cabinas están libres. Las llamadas tienen prioridad.';
}
function register(origin, destination, card = "") {
  const call = { number: ++scenario.registered, time, origin, destination, card, pickedUp: false };
  scenario.calls.push(call);
  days.at(-1)[trafficSlot()].push(origin);
  assignCall(scenario, call);
}
function generateTraffic() {
  const slot = trafficSlot();
  const probability = { manana: .22, dia: .09, tarde: .22, noche: .03 }[slot];
  if (scenario.calls.length >= 8 || Math.random() > probability) return;
  const floor = 1 + Math.floor(Math.random() * 10);
  const fromLobby = Math.random() < ({manana:.24,dia:.5,tarde:.78,noche:.6})[slot];
  register(fromLobby ? 0 : floor, fromLobby ? floor : 0);
}
const powerFormat = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const energyFormat = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

function render() {
  panel.querySelector('#sim-power').textContent = powerFormat.format(scenario.powerKw) + ' kW';
  panel.querySelector('#sim-energy').textContent = energyFormat.format(scenario.energyKwh) + ' kWh';
  const minute = simulatedMinute();
  const hh = String(Math.floor(minute / 60) % 24).padStart(2, '0');
  const mm = String(minute % 60).padStart(2, '0');
  clock.textContent = 'Día ' + (1 + Math.floor(minute / 1440)) + ' · ' + hh + ':' + mm + ' simuladas';
    panel.querySelectorAll('.sim-cab').forEach((cab, i) => {
      cab.style.setProperty('--floor', scenario.cars[i].floor);
      cab.dataset.empty = String(!scenario.cars[i].occupied);
      cab.dataset.open = String(scenario.cars[i].door > 0);
    });
    const picked = scenario.picked;
    const values = [scenario.floors, scenario.emptyFloors, `${scenario.completed}/${scenario.registered - (scenario.canceled ?? 0)}`,
      picked ? `${(scenario.wait * 2 / picked).toFixed(1).replace('.', ',')} s` : '—'];
    panel.querySelectorAll('.sim-totals dd').forEach((element, i) => { element.textContent = values[i]; });
    const status = panel.querySelector('.sim-legend');
    status.replaceChildren(...scenario.cars.map((car, i) => {
      const item = document.createElement('p');
      const task = car.queue[0];
      const action = car.door > 0 ? 'Puertas abiertas' : task ? (car.occupied ? 'Con pasajeros' : 'Yendo a buscar') : 'En espera';
      const target = task ? ' · llamada ' + task.call.number + ' · hacia ' + floorName(task.phase === 'pickup' ? task.call.origin : task.call.destination) : '';
      item.textContent = (i === 0 ? 'A' : 'B') + ' · ' + floorName(car.floor) + ' · ' + action + ' · ' + car.load + '/' + demoCapacity + ' pasajeros' + target;
      return item;
    }));
    const calls = panel.querySelector('.sim-llamadas');
    const active = scenario.calls;
    panel.querySelectorAll('.sim-storey').forEach(storey => {
      const floor = Number(storey.dataset.floor);
      const waiting = active.filter(call => !call.pickedUp && call.origin === floor);
      storey.querySelectorAll('button').forEach(button => {
        button.setAttribute('aria-pressed', String(waiting.some(call =>
          Math.sign(call.destination - floor) === Number(button.dataset.direction))));
      });
    });
    calls.replaceChildren(...(active.length ? active : [null]).map(call => {
      const item = document.createElement('li');
      item.textContent = call ? '#' + call.number + ' · ' + floorName(call.origin) + ' → ' + floorName(call.destination) +
        (call.card ? ' · ' + call.card : '') + (call.pickedUp ? ' · en cabina' : ' · esperando') : 'Sin llamadas activas';
      return item;
    }));
    const log = panel.querySelector('.sim-chat-log');
    const guide = document.querySelector('#lift-guide-state');
    const latest = scenario.events.at(-1);
    if (latest) guide.textContent = latest.title + '. ' + latest.detail;
    for (const event of scenario.events.splice(0)) {
      const bubble = document.createElement('div');
      const heading = document.createElement('strong');
      const message = document.createElement('p');
      heading.textContent = event.title;
      message.textContent = event.detail;
      bubble.append(heading, message);
      log.append(bubble);
      if (log.children.length > 35) log.firstElementChild.remove();
      log.scrollTop = log.scrollHeight;
    }

}
function step() {
  time++;
  if (simulatedMinute() % 1440 === 0) {
    days.push({ manana: [], dia: [], tarde: [], noche: [] });
    if (days.length > 365) days.shift();
  }
  if (trafficSlot() !== lastSlot) {
    lastSlot = trafficSlot();
    updateHistory();
  }
  if (!scenario.capacityDemo || scenario.calls.length === 0) generateTraffic();
  const previousFloors = scenario.cars.map(car => car.floor);
  advance(scenario, time);
  const estimate = estimateEnergy(scenario.cars, previousFloors);
  scenario.powerKw = estimate.powerKw;
  scenario.energyKwh += estimate.energyKwh;
  scenario.calls = scenario.calls.filter(call => !call.completed);
  if (time % 20 === 0) updateHistory();
  render();
}
function start() {
  timer = setInterval(step, 440);
  play.textContent = 'Pausar';
}
function reset() {
  clearInterval(timer);
  time = 0;
  lastSlot = trafficSlot();
  scenario = { parking: 0, calls: [], registered: 0, picked: 0, completed: 0,
    floors: 0, emptyFloors: 0, wait: 0, events: [],
    powerKw: 2 * standbyPowerKw, energyKwh: 0,
    cars: [0, 0].map(floor => ({floor, queue: [], occupied: false, door: 0, load: 0})) };
  panel.querySelector('.sim-chat-log').replaceChildren();
  summary.textContent = '';
  updateHistory();
  render();
  start();
}
function demoFullCar() {
  reset();
  scenario.capacityDemo = true;
  const [cabA, cabB] = scenario.cars;
  const trip = { number: ++scenario.registered, origin: 0, destination: 9, pickedUp: true, assigned: true };
  scenario.calls.push(trip);
  cabA.floor = 4;
  cabA.occupied = true;
  cabA.load = demoCapacity;
  cabA.queue.push({ call: trip, destination: 9, phase: 'dropoff' });
  cabB.floor = 1;
  register(5, 8);
  summary.textContent = 'Prueba: A está llena rumbo al piso 9. B atiende la llamada de subida del piso 5.';
  render();
}

function cancelWaitingCall(call) {
  scenario.calls = scenario.calls.filter(item => item !== call);
  for (const car of scenario.cars) car.queue = car.queue.filter(task => task.call !== call);
  scenario.canceled = (scenario.canceled ?? 0) + 1;
}

document.querySelector('#sim-full').addEventListener('click', demoFullCar);
panel.addEventListener('click', event => {
  const button = event.target.closest('button[data-direction]');
  if (!button) return;
  const origin = Number(button.closest('.sim-storey').dataset.floor);
  const direction = Number(button.dataset.direction);
  const card = document.querySelector('#sim-card').value;
  const previous = card && scenario.calls.find(call => call.card === card);
  if (previous?.pickedUp) {
    summary.textContent = card + ' está viajando. Puede hacer otra llamada al llegar.';
    return;
  }
  const sameRequest = previous && previous.origin === origin &&
    Math.sign(previous.destination - previous.origin) === direction;
  if (sameRequest || (!card && button.getAttribute('aria-pressed') === 'true')) {
    summary.textContent = 'La llamada para ' + (direction > 0 ? 'subir' : 'bajar') + ' desde ' + floorName(origin) + ' ya está registrada.';
    return;
  }
  const options = direction > 0 ? 10 - origin : origin;
  const destination = origin + direction * (1 + Math.floor(Math.random() * options));
  if (previous) cancelWaitingCall(previous);
  register(origin, destination, card);
  summary.textContent = 'Llamada registrada desde ' + floorName(origin) + ' hacia ' + floorName(destination) + '.';
  updateHistory();
  render();
});
period.addEventListener('change', updateHistory);
play.addEventListener('click', () => {
  if (!timer) return start();
  clearInterval(timer);
  timer = undefined;
  play.textContent = 'Continuar';
});
document.querySelector('#sim-reset').addEventListener('click', reset);
reset();
