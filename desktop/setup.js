const form = document.querySelector('#settings');
const error = document.querySelector('#error');
const status = document.querySelector('#status');
const save = document.querySelector('#save');
const storageMode = document.querySelector('#storageMode');
const tenantMode = document.querySelector('#tenantMode');
const serverUrl = document.querySelector('#serverUrl');
const deferConnection = document.querySelector('#deferConnection');

function updateVisibility() {
  const hosted = storageMode.value === 'hosted';
  document.querySelector('#hostedOptions').hidden = !hosted;
  document.querySelector('#postgresOptions').hidden = storageMode.value !== 'postgres';
  document.querySelector('#localOptions').hidden = storageMode.value !== 'single';
  document.querySelector('#tenantOptions').hidden = tenantMode.value !== 'fixed';
  document.querySelector('#integrationOptions').hidden = hosted;
  document.querySelector('#firstAdminNotice').hidden = hosted;
  save.textContent = hosted
    ? (!serverUrl.value.trim() || deferConnection.checked
      ? 'Save server details for later'
      : 'Verify HTTPS & connect')
    : 'Save securely and start local server';
}
storageMode.addEventListener('change', updateVisibility);
tenantMode.addEventListener('change', updateVisibility);
serverUrl.addEventListener('input', updateVisibility);
deferConnection.addEventListener('change', updateVisibility);

document.querySelector('#browse').addEventListener('click', async () => {
  const folder = await window.apexDesktopSetup.chooseDirectory();
  if (folder) document.querySelector('#dataDirectory').value = folder;
});

(async () => {
  try {
    const data = await window.apexDesktopSetup.getConfig();
    for (const [name, value] of Object.entries(data)) {
      const control = form.elements.namedItem(name);
      if (control && typeof value === 'string') control.value = value;
    }
    if (data.storageMode === 'hosted' && data.serverUrl && data.connectionPending) {
      // Preserve a user's "save for later" choice, including across restart.
      deferConnection.checked = true;
    }
    if (data.connectionError) {
      status.textContent = data.connectionError;
      status.classList.add('warning');
    }
    updateVisibility();
  } catch (e) {
    error.hidden = false;
    error.textContent = 'Unable to read protected configuration: ' + e.message;
  }
})();

form.addEventListener('submit', async event => {
  event.preventDefault();
  error.hidden = true;
  status.classList.remove('warning');
  status.textContent = '';
  save.disabled = true;
  const data = Object.fromEntries(new FormData(form));
  if (data.storageMode === 'postgres' && !data.databaseUrl) {
    error.textContent = 'A PostgreSQL runtime connection URL is required.';
    error.hidden = false;
    save.disabled = false;
    return;
  }
  const hosted = data.storageMode === 'hosted';
  status.textContent = hosted
    ? (data.deferConnection === 'on' || !data.serverUrl ? 'Saving for later…' : 'Verifying HTTPS, API compatibility and server health…')
    : 'Validating and starting the private local server…';
  try {
    const result = await window.apexDesktopSetup.save(data);
    if (!result.ok) throw new Error(result.error || 'Settings were not saved.');
    if (result.pending) {
      status.textContent = result.message ||
        'Saved. Open Server → Configure / Change Server when deployment is complete.';
      status.classList.add('warning');
    } else {
      status.textContent = 'Server verified; secure connection saved.';
    }
  } catch (e) {
    error.textContent = e.message || 'Connection failed. Check the deployed server and TLS certificate.';
    error.hidden = false;
    status.textContent = '';
  } finally {
    save.disabled = false;
    updateVisibility();
  }
});
