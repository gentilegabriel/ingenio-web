const colors = { Red: '#ffc36e', G1: '#78efb5', G2: '#79c7ff' };

function prepare(canvas) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const ratio = window.devicePixelRatio || 1;
  if (!width || !height) return null;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.font = '13px system-ui';
  return { ctx, width, height };
}

export function drawScope(canvas, sources, phase, overlay = false) {
  const frame = prepare(canvas);
  if (!frame) return;
  const { ctx, width, height } = frame;
  ctx.strokeStyle = '#2b383c';
  for (let i = 0; i <= 6; i++) {
    const x = width * i / 6;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  ctx.fillStyle = '#dce4e6';
  ctx.fillText('10 ms/div', 10, height - 6);
  if (!sources.length) {
    ctx.fillText('Corte de energía · esperando generación', 12, height / 2);
    return;
  }
  const lane = (height - 24) / (overlay ? 1 : sources.length);
  sources.forEach((signal, index) => {
    const center = lane * (overlay ? .55 : index + .5);
    const amplitude = signal.voltage / Math.sqrt(3) * Math.SQRT2;
    ctx.strokeStyle = '#2b383c';
    ctx.beginPath();
    ctx.moveTo(0, center);
    ctx.lineTo(width, center);
    ctx.stroke();
    ctx.strokeStyle = ctx.fillStyle = colors[signal.name];
    ctx.lineWidth = overlay ? 2 : 1.6;
    ctx.setLineDash(overlay && index ? [7, 4] : []);
    ctx.fillText(signal.name + ' · ' + ['R', 'S', 'T'][phase], 8 + (overlay ? index * width / 3 : 0), overlay ? 15 : lane * index + 15);
    ctx.beginPath();
    for (let x = 0; x <= width; x++) {
      const angle = 2 * Math.PI * (signal.frequency * .06 * x / width - phase / 3) + signal.phase * Math.PI / 180;
      const y = center - amplitude / 400 * lane * .36 * Math.sin(angle);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  });
}

export function drawTriangle(canvas, load) {
  const frame = prepare(canvas);
  if (!frame) return;
  const { ctx, width, height } = frame;
  const x = 29;
  const y = height / 2;
  const scale = Math.min((width - 70) / 100, (height / 2 - 27) / 70);
  const px = x + load.p * scale;
  const py = y - load.q * scale;
  const segments = [
    [x, y, px, y, '#78efb5', 'P'],
    [px, y, px, py, '#ffc36e', 'Q'],
    [x, y, px, py, '#79c7ff', 'S']
  ];
  for (const [x1, y1, x2, y2, color, label] of segments) {
    if (x1 === x2 && y1 === y2) continue;
    ctx.strokeStyle = ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.fillText(label, (x1 + x2) / 2 + 5, (y1 + y2) / 2 + (label === 'P' ? 18 : -7));
  }
}
