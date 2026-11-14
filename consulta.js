const form = document.querySelector('#consulta-form');
const division = document.querySelector('#division');
const result = document.querySelector('#resultado');
const draft = document.querySelector('#borrador');
const status = document.querySelector('#estado');
const whatsapp = document.querySelector('#enviar-whatsapp');
const whatsappUrl = new URL(whatsapp.href);

document.querySelectorAll('[data-division]').forEach(link => {
  link.addEventListener('click', () => {
    division.value = link.dataset.division;
    result.hidden = true;
  });
});

form.addEventListener('input', () => {
  result.hidden = true;
  status.textContent = '';
});

form.addEventListener('submit', event => {
  event.preventDefault();
  const { ubicacion, detalle } = form.elements;
  for (const field of [ubicacion, detalle]) {
    if (!field.value.trim()) {
      field.value = '';
      field.reportValidity();
      return;
    }
  }

  draft.value = [
    'Consulta técnica para INGENIO',
    '',
    'División: ' + division.value,
    'Localidad: ' + ubicacion.value.trim(),
    '',
    detalle.value.trim()
  ].join('\n');
  whatsappUrl.searchParams.set('text', draft.value);
  whatsapp.href = whatsappUrl.href;
  status.textContent = '';
  result.hidden = false;
  draft.focus();
});

document.querySelector('#copiar').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(draft.value);
    status.textContent = 'Consulta copiada.';
  } catch {
    draft.focus();
    draft.select();
    status.textContent = 'El texto está seleccionado. Usá la opción Copiar de tu dispositivo.';
  }
});
