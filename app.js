const DEFAULT_WEBHOOK = 'PEGA_AQUI_TU_URL_DE_APPS_SCRIPT';
const STORAGE_URL_KEY = 'gastos_webhook_url';
const STORAGE_QUEUE_KEY = 'gastos_offline_queue';

let selectedTopic = 'Comida';

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

webhookInput.value = localStorage.getItem(STORAGE_URL_KEY) || DEFAULT_WEBHOOK;

document.getElementById('toggleConfig').addEventListener('click', () => {
  configPanel.classList.toggle('open');
});

document.getElementById('saveConfig').addEventListener('click', () => {
  localStorage.setItem(STORAGE_URL_KEY, webhookInput.value.trim());
  configPanel.classList.remove('open');
  mostrarEstado('URL guardada. Reintentando pendientes...', '#10b981');
  sincronizarPendientes();
});

document.querySelectorAll('.topic-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.topic-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedTopic = btn.dataset.topic;
  });
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
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

  const resultado = await enviarAlServidor(payload);

  if (resultado.ok) {
    montoInput.value = '';
    mostrarEstado(`Guardado: $${payload.monto.toFixed(2)} en ${payload.topico}`, '#10b981');
  } else if (resultado.offline) {
    encolarOffline(payload);
    montoInput.value = '';
    mostrarEstado('Sin internet: guardado en cola local', '#f59e0b');
  } else {
    // Hay internet, pero el servidor o la URL devolvió un error
    mostrarEstado(`Error: ${resultado.error}`, '#ef4444');
  }

  submitBtn.disabled = false;
});

async function enviarAlServidor(payload) {
  const url = (localStorage.getItem(STORAGE_URL_KEY) || DEFAULT_WEBHOOK).trim();

  if (!navigator.onLine) {
    return { ok: false, offline: true };
  }
  if (!url.startsWith('https://')) {
    return { ok: false, offline: false, error: 'Configura una URL válida en ⚙️' };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    const texto = await res.text();

    // Si Google devuelve HTML, suele ser pantalla de login por permisos mal puestos
    if (texto.trim().startsWith('<')) {
      return {
        ok: false,
        offline: false,
        error: 'Google devolvió HTML (revisa que el acceso sea "Cualquier persona" y la URL termine en /exec)'
      };
    }

    const data = JSON.parse(texto);
    if (data.status === 'ok') {
      return { ok: true };
    }
    return { ok: false, offline: false, error: data.message || 'Respuesta inesperada del script' };
  } catch (err) {
    return {
      ok: false,
      offline: false,
      error: `Fallo de red/CORS (${err.message}). Revisa la URL en ⚙️`
    };
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
    const res = await enviarAlServidor(item);
    if (!res.ok) restantes.push(item);
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
    offlineBadge.textContent = `${queue.length} gasto(s) pendiente(s) — Toca aquí para reintentar`;
    offlineBadge.style.cursor = 'pointer';
    offlineBadge.onclick = sincronizarPendientes;
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
