const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const number = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const fmt = (value, unit) => number.format(value) + ' ' + unit;
const slider = (label, min, max, initial, unit = '', step = 1) => ({ label, min, max, initial, unit, step });
const toggle = (label, initial = false) => ({ label, initial });
const smooth = (s, key, target, factor = .16) => s[key] = (s[key] ?? target) + (target - (s[key] ?? target)) * factor;

const labs = {
  telemetria: {
    title:'Telemetría industrial',
    guide:'Cambiá el nivel remoto y cortá la comunicación. Observá la edad del último dato recibido y recuperá el enlace.',
    controls:{level:slider('Nivel remoto',0,100,45,'%'), threshold:slider('Umbral de alarma',0,100,75,'%'), link:toggle('Enlace disponible',true)},
    tick({level,threshold,link},s){
      if(link){s.last=level;s.age=0;} else s.age=(s.age??0)+1;
      const status=!link?'Enlace caído. El último dato puede estar desactualizado.':level>=threshold?'Alarma: nivel alto.':'Datos actualizados.';
      return {rows:[['Nivel recibido',s.last===undefined?'—':fmt(s.last,'%')],['Edad del dato',s.last===undefined?'—':fmt(s.age,'s simulados')]],status,trend:s.last??0,max:100,label:'Último nivel recibido · %'};
    }
  },
  scada: {
    title:'SCADA y sala de control',
    guide:'Subí el caudal de entrada con la bomba detenida para provocar una alarma. Reconocela y encendé la bomba para recuperar el nivel.',
    controls:{inlet:slider('Entrada al tanque',0,100,55,'%'), pump:toggle('Bomba de salida'), acknowledge:toggle('Reconocer alarma activa')},
    tick({inlet,pump,acknowledge},s){
      const level=s.level=clamp((s.level??65)+(inlet-(pump?85:0))/55,0,100);
      if(level<80) s.ack=false;
      else if(acknowledge && !s.lastAck) s.ack=true;
      s.lastAck=acknowledge;
      return {rows:[['Nivel del tanque',fmt(level,'%')],['Bomba',pump?'En marcha':'Detenida']],status:level>=80?(s.ack?'Nivel alto · alarma reconocida':'Nivel alto · alarma pendiente'):'Nivel dentro del rango de la práctica.',trend:level,max:100,label:'Nivel del tanque · %'};
    }
  },
  petroleo: {
    title:'Planta de petróleo y gas',
    guide:'Regulá la entrada y las salidas de un separador ficticio. Observá cómo se acumulan líquido y gas si entra más de lo que sale.',
    controls:{inlet:slider('Entrada al separador',0,100,50,'%'), liquid:slider('Salida de líquido',0,100,45,'%'), gas:slider('Salida de gas',0,100,45,'%')},
    tick({inlet,liquid,gas},s){
      const level=s.level=clamp((s.level??45)+(inlet-liquid)/70,0,100);
      const pressure=s.pressure=clamp((s.pressure??3)+(inlet-gas)/600,0,10);
      return {rows:[['Nivel de líquido',fmt(level,'%')],['Presión',fmt(pressure,'bar')]],status:level>=85||pressure>=7?'Alarma de proceso en el modelo. Revisá el balance de entradas y salidas.':'Separación en curso.',trend:pressure,max:10,label:'Presión del separador · bar'};
    }
  },
  paralelo: {
    title:'Central de generación en paralelo',
    guide:'La planta arranca con G1. Subí la demanda, incorporá G2 y ajustá el reparto. En la demo de transferencia podés ver el sincronismo y las ondas.',
    controls:{demand:slider('Demanda',0,160,50,'kW'), second:toggle('Solicitar entrada de G2'), share:slider('Aporte solicitado a G1',0,100,50,'%')},
    tick({demand,second,share},s){
      s.sync=second?Math.min(5,(s.sync??0)+1):0;
      const parallel=s.sync===5;
      const delivered=Math.min(demand,parallel?160:80);
      const first=parallel?clamp(delivered*share/100,Math.max(0,delivered-80),80):delivered;
      return {rows:[['G1',fmt(first,'kW')],['G2',fmt(delivered-first,'kW')],['Demanda pendiente',fmt(demand-delivered,'kW')]],
        status:parallel?'Grupos acoplados y repartiendo carga.':second?'Sincronizando G2 · '+(5-s.sync)+' s simulados.':'G1 alimenta la barra simulada.',
        trend:delivered,max:160,label:'Potencia entregada · kW'};
    }
  },
  solar: {
    title:'Generación solar y baterías',
    guide:'Bajá la irradiación para simular nubes o noche. La batería cubre el déficit mientras tiene carga y se recarga con los excedentes.',
    controls:{sun:slider('Irradiación relativa',0,100,70,'%'), demand:slider('Demanda',0,100,30,'kW')},
    tick({sun,demand},s){
      const solar=.8*sun;
      const stored=s.stored??50;
      const battery=clamp(demand-solar,-Math.min(25,(100-stored)*60),Math.min(25,stored*60));
      s.stored=clamp(stored-battery/60,0,100);
      const deficit=Math.max(0,demand-solar-battery);
      return {rows:[['Producción solar',fmt(solar,'kW')],['Batería',fmt(s.stored,'%')],['Potencia de batería',fmt(battery,'kW')],['Demanda sin cubrir',fmt(deficit,'kW')]],
        status:deficit>0?'La combinación de solar y batería no cubre toda la demanda.':battery<0?'El excedente solar carga la batería.':battery>0?'La batería entrega potencia.':'La producción cubre la demanda.',
        trend:s.stored,max:100,label:'Estado de carga · % · cada paso representa un minuto'};
    }
  },
  plc: {
    title:'PLC y Modbus',
    guide:'Alterná el sensor de nivel y el permiso de marcha. Seguí la salida de la bomba y la lectura de registros del PLC virtual.',
    controls:{low:toggle('I0.0 · Nivel bajo',true), permit:toggle('I0.1 · Permiso de marcha',true), link:toggle('Comunicación Modbus disponible',true)},
    tick({low,permit,link}){
      const output=low&&permit;
      return {rows:[['Q0.0 · Bomba',output?'1 · activada':'0 · detenida'],['Registro 0 · Entradas',link?String(Number(low)+2*Number(permit)):'Sin respuesta'],
        ['Registro 1 · Salida',link?String(Number(output)):'Sin respuesta']],status:link?'PLC virtual: la bomba requiere nivel bajo y permiso de marcha.':'El PLC virtual sigue ejecutando su lógica. La lectura remota queda sin respuesta.',
        trend:Number(output),max:1,label:'Estado de salida · 0 / 1'};
    }
  },
  bombas: {
    title:'Bombas y variadores',
    guide:'Aumentá la demanda y mirá cómo cae la presión. Subí la consigna de velocidad o encendé la bomba auxiliar para recuperarla.',
    controls:{speed:slider('Velocidad del variador',0,100,65,'%'), demand:slider('Demanda de caudal',0,100,45,'%'), assist:toggle('Bomba auxiliar')},
    tick({speed,demand,assist},s){
      const pressure=smooth(s,'pressure',clamp(6*(speed/100)**2+Number(assist)*1.8-demand*.025,0,8));
      return {rows:[['Presión de cabecera',fmt(pressure,'bar')],['Frecuencia',fmt(speed/2,'Hz')],['Bomba auxiliar',assist?'En marcha':'Detenida']],
        status:pressure<1.5?'Presión baja para el escenario de ejemplo.':'Presión dentro del rango de práctica.',trend:pressure,max:8,label:'Presión de cabecera · bar'};
    }
  }
};

function analog(label, unit, max, initial) {
  return {
    guide: 'Variá la magnitud y compará la corriente con la lectura del PLC. Los rangos son de práctica.',
    controls: { value: slider(label, 0, max, initial, unit, .1), zero: slider('Ajuste de cero', -2, 2, 0, 'mA', .1), wire: toggle('Simular lazo abierto') },
    tick({value, zero, wire}) {
      const current = wire ? 0 : clamp(4 + 16 * value / max + zero, 4, 20);
      const indicated = (current - 4) * max / 16;
      return { rows: [['Corriente', fmt(current, 'mA')], ['Lectura del PLC', wire ? 'Falla de lazo' : fmt(indicated, unit)], ['Error', wire ? '—' : fmt(indicated - value, unit)]],
        status: wire ? 'El PLC detecta el lazo abierto.' : 'El PLC convierte la corriente de 4 a 20 mA al rango configurado.',
        trend: current, max: 20, label: 'Corriente del lazo · mA' };
    }
  };
}

const pressure = analog('Presión diferencial', 'bar', 10, 5);
const flow = analog('Caudal de líquido conductor', 'm³/h', 250, 100);
const profiles = {
  instrumentacion: [
    ['Emerson Rosemount 3051', 'Presión · cableado 4–20 mA/HART', pressure],
    ['ABB 266DSH', 'Presión diferencial · cableado 4–20 mA/HART', pressure],
    ['Yokogawa EJA110E', 'Presión diferencial · cableado 4–20 mA/HART', pressure],
    ['Emerson Rosemount 3051S inalámbrico', 'Presión · WirelessHART', {
      guide: 'Variá la presión y cortá el enlace. El gateway conserva la última lectura y muestra su antigüedad.',
      controls: {value: slider('Presión', 0, 10, 5, 'bar', .1), link: toggle('Enlace inalámbrico disponible', true)},
      tick({value, link}, state) {
        if (link) { state.last = value; state.age = 0; }
        else state.age = (state.age ?? 0) + 1;
        return {rows: [['Presión recibida', state.last === undefined ? '—' : fmt(state.last, 'bar')], ['Edad del dato', state.last === undefined ? '—' : fmt(state.age, 's')]],
          status: link ? 'Gateway en línea.' : 'Enlace caído. El último dato recibido queda marcado como desactualizado.',
          trend: state.last ?? 0, max: 10, label: 'Presión recibida · bar'};
      }
    }],
    ['ABB ProcessMaster FEP630', 'Caudalímetro electromagnético · perfil 4–20 mA', flow],
    ['Yokogawa ADMAG AXG', 'Caudalímetro electromagnético · perfil 4–20 mA', flow],
    ['Emerson Rosemount 3051S + elemento primario', 'Caudal por presión diferencial · perfil 4–20 mA', {
      guide: 'Variá la presión diferencial y observá cómo el caudal cambia con su raíz cuadrada.',
      controls: {dp: slider('Presión diferencial', 0, 100, 25, 'kPa')},
      tick({dp}) {
        const ratio = Math.sqrt(dp / 100);
        return {rows: [['Caudal calculado', fmt(200 * ratio, 'm³/h')], ['Salida escalada a caudal', fmt(4 + 16 * ratio, 'mA')]],
          status: 'La salida representa caudal con extracción de raíz cuadrada en este ejercicio.',
          trend: 200 * ratio, max: 200, label: 'Caudal · m³/h'};
      }
    }],
    ['Emerson FloBoss 107', 'Computador de caudal de gas', {
      guide: 'Elegí el caudal de gas y pausá el flujo para ver cómo se totaliza el volumen.',
      controls: {rate: slider('Caudal normalizado de ejemplo', 0, 5000, 1500, 'Nm³/h'), enabled: toggle('Flujo activo', true)},
      tick({rate, enabled}, state) {
        const current = enabled ? rate : 0;
        state.volume = (state.volume ?? 0) + current / 3600;
        return {rows: [['Caudal', fmt(current, 'Nm³/h')], ['Volumen acumulado', fmt(state.volume, 'Nm³')]],
          status: 'Totalización didáctica de un caudal ya normalizado.',
          trend: current, max: 5000, label: 'Caudal normalizado · Nm³/h'};
      }
    }],
    ['ABB CM-MSS con termistor PTC', 'Protección térmica de motor · señal discreta', {
      guide: 'Variá la resistencia equivalente del PTC para observar la actuación del relé.',
      controls: {resistance: slider('Resistencia equivalente del PTC', .2, 5, 1, 'kΩ', .1)},
      tick({resistance}) {
        const trip = resistance >= 3;
        return {rows: [['Entrada PTC', fmt(resistance, 'kΩ')], ['Relé térmico', trip ? 'Disparado' : 'Normal']],
          status: 'Umbral de 3 kΩ usado únicamente para esta práctica.',
          trend: resistance, max: 5, label: 'Resistencia equivalente · kΩ'};
      }
    }]
  ],
  plc: [
    ['Siemens SIMATIC S7-1200', 'PLC · práctica de lectura Modbus TCP', labs.plc],
    ['Schneider Electric Modicon M221', 'PLC · práctica de lectura Modbus', labs.plc]
  ]
};

const find = id => document.getElementById(id);
const key = new URLSearchParams(location.search).get('demo');
const quotes = {
  "instrumentacion": {
    "label": "Cotizar instrumentación y calibración",
    "url": "https://wa.me/5492994535615?text=Hola%20INGENIO%2C%20prob%C3%A9%20la%20demo%20y%20quiero%20cotizar%20instrumentaci%C3%B3n%2C%20calibraci%C3%B3n%20o%20integraci%C3%B3n%20de%20transmisores."
  },
  "telemetria": {
    "label": "Cotizar monitoreo remoto",
    "url": "https://wa.me/5492994535615?text=Hola%20INGENIO%2C%20prob%C3%A9%20la%20demo%20y%20quiero%20cotizar%20telemetr%C3%ADa%20y%20alarmas%20para%20mis%20equipos."
  },
  "scada": {
    "label": "Cotizar integración scada",
    "url": "https://wa.me/5492994535615?text=Hola%20INGENIO%2C%20prob%C3%A9%20la%20demo%20y%20quiero%20cotizar%20una%20integraci%C3%B3n%20SCADA%20con%20alarmas%20e%20hist%C3%B3ricos."
  },
  "petroleo": {
    "label": "Cotizar instrumentación para petróleo y gas",
    "url": "https://wa.me/5492994535615?text=Hola%20INGENIO%2C%20prob%C3%A9%20la%20demo%20y%20quiero%20cotizar%20instrumentaci%C3%B3n%20y%20control%20para%20una%20instalaci%C3%B3n%20de%20petr%C3%B3leo%20y%20gas."
  },
  "paralelo": {
    "label": "Cotizar grupos en paralelo y tableros",
    "url": "https://wa.me/5492994535615?text=Hola%20INGENIO%2C%20prob%C3%A9%20la%20demo%20y%20quiero%20cotizar%20grupos%20electr%C3%B3genos%20en%20paralelo%20con%20tableros%20y%20puesta%20en%20marcha."
  },
  "solar": {
    "label": "Cotizar solar y baterías",
    "url": "https://wa.me/5492994535615?text=Hola%20INGENIO%2C%20prob%C3%A9%20la%20demo%20y%20quiero%20cotizar%20un%20sistema%20solar%20con%20bater%C3%ADas."
  },
  "plc": {
    "label": "Cotizar automatización con plc",
    "url": "https://wa.me/5492994535615?text=Hola%20INGENIO%2C%20prob%C3%A9%20la%20demo%20y%20quiero%20cotizar%20automatizaci%C3%B3n%20con%20PLC%20e%20integraci%C3%B3n%20Modbus."
  },
  "bombas": {
    "label": "Cotizar bombas y variadores",
    "url": "https://wa.me/5492994535615?text=Hola%20INGENIO%2C%20prob%C3%A9%20la%20demo%20y%20quiero%20cotizar%20control%20de%20bombas%20y%20variadores%20de%20velocidad."
  }
};
const quote = Object.hasOwn(quotes, key) ? quotes[key] : quotes.instrumentacion;
find("lab-quote").href = quote.url;
find("lab-quote").textContent = quote.label + " por WhatsApp";
const choices = Object.hasOwn(profiles, key) ? profiles[key] : null;
const title = key === 'instrumentacion' ? 'Instrumentación de campo' : Object.hasOwn(labs, key) ? labs[key].title : 'Instrumentación de campo';
const catalog = choices ?? (Object.hasOwn(labs, key) ? null : profiles.instrumentacion);
const state = {};
let lab;
let trend = [];
let inputs = [];

function configure(index = 0) {
  const profile = catalog?.[index];
  lab = profile ? profile[2] : labs[key];
  find('title').textContent = title;
  document.title = title + ' | Ingenio Digital';
  find('guide').textContent = lab.guide;
  find('device-description').textContent = profile ? profile[1] + ' · Perfil didáctico' : '';
  find('controls').replaceChildren();
  inputs = Object.entries(lab.controls).map(([id,control]) => {
  const label=document.createElement('label');
  const input=document.createElement('input');
  const output=document.createElement('output');
  input.id='control-'+id;
  label.htmlFor=input.id;
  if(typeof control.initial==='boolean'){
    input.type='checkbox';
    label.append(input,control.label);
  } else {
    input.type='range';
    Object.assign(input,{min:control.min,max:control.max,step:control.step});
    label.append(control.label,output,input);
  }
  find('controls').append(label);
  return {id,control,input,output};
  });
  reset();
}

function update() {
  const values=Object.fromEntries(inputs.map(({id,control,input,output})=>{
    if(input.type==='checkbox') return [id,input.checked];
    output.textContent=fmt(Number(input.value),control.unit);
    return [id,Number(input.value)];
  }));
  const result=lab.tick(values,state);
  find('readings').replaceChildren(...result.rows.map(([label,value])=>{
    const row=document.createElement('div');
    const title=document.createElement('dt');
    const data=document.createElement('dd');
    title.textContent=label;
    data.textContent=value;
    row.append(title,data);
    return row;
  }));
  if(find('status').textContent!==result.status) find('status').textContent=result.status;
  find('legend').textContent=result.label;
  trend.push(result.trend);
  if(trend.length>60) trend.shift();
  const canvas=find('trend');
  const context=canvas.getContext('2d');
  context.clearRect(0,0,canvas.width,canvas.height);
  context.strokeStyle='#333';
  for(let row=1;row<4;row++){
    const y=row*canvas.height/4;
    context.beginPath();
    context.moveTo(0,y);
    context.lineTo(canvas.width,y);
    context.stroke();
  }
  context.strokeStyle='#70e0ad';
  context.lineWidth=3;
  context.beginPath();
  trend.forEach((value,index)=>{
    const x=index*canvas.width/59;
    const y=canvas.height-6-clamp(value/result.max,0,1)*(canvas.height-12);
    if(index===0) context.moveTo(x,y);
    else context.lineTo(x,y);
  });
  context.stroke();
}

function reset() {
  Object.keys(state).forEach(key => delete state[key]);
  trend=[];
  inputs.forEach(({input,control})=>{
    if(input.type==='checkbox') input.checked=control.initial;
    else input.value=control.initial;
  });
  update();
}
find('reset').addEventListener('click',reset);
if (catalog) {
  const select = find('device');
  find('device-picker').hidden = false;
  catalog.forEach(([name], index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = name;
    select.append(option);
  });
  select.addEventListener('change', () => configure(Number(select.value)));
}
configure();
setInterval(update,1000);
