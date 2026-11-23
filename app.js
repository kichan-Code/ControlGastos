const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbz4U5iLRqMAIdrzqu9ohDYRD7suyjlxaLHrYn9gqbZKmJjF1iCmBlF2oF9-cncMxpq_Cw/exec';
const STORAGE_URL_KEY = 'gastos_webhook_url';
const STORAGE_QUEUE_KEY = 'gastos_offline_queue';

let selectedTopic = 'Comida';

// Registrar Service Worker para que la app sea instalable
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(console.error);
}

const form = document.getElementById('expenseForm');
const montoInput = document.getElementById('monto');
const statusMsg = document.getElementById('statusMsg');
const submitBtn = document.getElementById('submitBtn');
const offlineBadge = document.getElementById('offlineBadge');
const configPanel = document.getElementById('configPanel');
const webhookInput = document.getElementById('webhookUrl');

// Cargar URL guardada
webhookInput.value = localStorage.getItem(STORAGE_URL_KEY) || DEFAULT_WEBHOOK;

document.getElementById('toggleConfig').addEventListener('click', () => {
  configPanel.classList.toggle('open');
});

document.getElementById('saveConfig').addEventListener('click', () => {
  localStorage.setItem(STORAGE_URL_KEY, webhookInput.value.trim());
  configPanel.classList.remove('open');
  mostrarEstado('URL guardada correctamente', '#10b981');
});

// Selección de tópicos
document.querySelectorAll('.topic-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.topic-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedTopic = btn.dataset.topic;
  });
});

// Envío del formulario
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  // Normalizar coma decimal a punto decimal
  const montoNormalizado = parseFloat(montoInput.value.replace(',', '.'));

  if (isNaN(montoNormalizado) || montoNormalizado <= 0) {
    mostrarEstado('Ingresa un monto válido mayor a 0', '#ef4444');
    return;
  }

  const payload = {
    topico: selectedTopic,
    monto: Number(montoNormalizado.toFixed(2))
  };

  submitBtn.disabled = true;
  mostrarEstado('Enviando...', '#94a3b8');

  const enviado = await enviarAlServidor(payload);

  if (enviado) {
    montoInput.value = '';
    mostrarEstado(`Guardado: $${payload.monto.toFixed(2)} en ${payload.topico}`, '#10b981');
  } else {
    encolarOffline(payload);
    montoInput.value = '';
    mostrarEstado('Sin conexión: guardado localmente para sincronizar luego', '#f59e0b');
  }

  submitBtn.disabled = false;
});

async function enviarAlServidor(payload) {
  const url = localStorage.getItem(STORAGE_URL_KEY) || DEFAULT_WEBHOOK;
  if (!navigator.onLine || !url.startsWith('http')) return false;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
}

function encolarOffline(payload) {
  const queue = JSON.parse(localStorage.getItem(STORAGE_QUEUE_KEY) || '[]');
  queue.push(payload);
  localStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(queue));
  actualizarBadge();
}

async function sincronizarPendientes() {
  const queue = JSON.parse(localStorage.getItem(STORAGE_QUEUE_KEY) || '[]');
  if (queue.length === 0 || !navigator.onLine) return;

  const restantes = [];
  for (const item of queue) {
    const ok = await enviarAlServidor(item);
    if (!ok) restantes.push(item);
  }

  localStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(restantes));
  actualizarBadge();
  if (restantes.length === 0) {
    mostrarEstado('Gastos pendientes sincronizados con Google Sheets', '#10b981');
  }
}

function actualizarBadge() {
  const queue = JSON.parse(localStorage.getItem(STORAGE_QUEUE_KEY) || '[]');
  if (queue.length > 0) {
    offlineBadge.style.display = 'block';
    offlineBadge.textContent = `${queue.length} gasto(s) pendiente(s) de sincronizar`;
  } else {
    offlineBadge.style.display = 'none';
  }
}

function mostrarEstado(texto, color) {
  statusMsg.textContent = texto;
  statusMsg.style.color = color;
}

window.addEventListener('online', sincronizarPendientes);
actualizarBadge();
sincronizarPendientes();