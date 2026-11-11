const form = document.querySelector('#settings');
const error = document.querySelector('#error');
const status = document.querySelector('#status');
const save = document.querySelector('#save');
const storageMode = document.querySelector('#storageMode');
const tenantMode = document.querySelector('#tenantMode');
const show = () => {
  document.querySelector('#postgresOptions').hidden = storageMode.value !== 'postgres';
  document.querySelector('#localOptions').hidden = storageMode.value !== 'single';
  document.querySelector('#tenantOptions').hidden = tenantMode.value !== 'fixed';
};
storageMode.addEventListener('change', show);
tenantMode.addEventListener('change', show);
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
    show();
  } catch (e) {
    error.hidden = false;
    error.textContent = 'Unable to read protected configuration: ' + e.message;
  }
})();
form.addEventListener('submit', async event => {
  event.preventDefault();
  error.hidden = true;
  status.textContent = '';
  save.disabled = true;
  const data = Object.fromEntries(new FormData(form));
  if (data.storageMode === 'postgres' && !data.databaseUrl) {
    error.textContent = 'A PostgreSQL runtime connection URL is required.';
    error.hidden = false;
    save.disabled = false;
    return;
  }
  status.textContent = 'Validating and starting the local backend…';
  try {
    const result = await window.apexDesktopSetup.save(data);
    if (!result.ok) throw new Error(result.error || 'Settings were not saved.');
    status.textContent = 'Configuration saved securely.';
  } catch (e) {
    error.textContent = e.message;
    error.hidden = false;
    status.textContent = '';
  } finally {
    save.disabled = false;
  }
});
