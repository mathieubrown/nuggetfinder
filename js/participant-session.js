(function () {
  'use strict';
  const key = 'nuggetfinder.player.v2';
  const enabled = document.querySelector('meta[name=nugget-scoped-app]')?.content === 'enabled';
  let session = null;
  let connecting = null;

  function current() {
    return session?.expiresAt > Date.now() ? session : null;
  }

  function save(value) {
    session = value;
    try {
      if (value && enabled) sessionStorage.setItem(key, JSON.stringify(value));
      else sessionStorage.removeItem(key);
    } catch { /* In-memory sessions still work. */ }
    window.dispatchEvent(new Event('nugget-player-connected'));
  }

  function setSession(data) {
    if (typeof data.token !== 'string' || data.token.length < 32 || !data.participant) throw Error('invalid_player_session');
    save({...data, expiresAt: Date.now() + Number(data.expires_in) * 1000});
  }

  async function request(path, data, token) {
    const response = await fetch('/api/' + path, {
      method: 'POST', credentials: 'omit', headers: {
        'Content-Type': 'application/json', ...(token ? {Authorization: 'Bearer ' + token} : {})
      }, body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'service_unavailable');
    return result;
  }

  async function restore() {
    if (!enabled || current()) return current();
    let stored;
    try { stored = JSON.parse(sessionStorage.getItem(key)); } catch { return null; }
    if (!stored || stored.expiresAt <= Date.now() || typeof stored.token !== 'string') return null;
    try {
      const identity = await request('player', {}, stored.token);
      if (!current()) setSession({...identity, token: stored.token});
    } catch (error) {
      if(error.message==='participant_session_unavailable' && !current()){
        try { sessionStorage.removeItem(key); } catch { /* Storage may be disabled. */ }
      }
    }
    return current();
  }

  function showPairing() {
    const dialog = document.createElement('dialog');
    dialog.className = 'participant-connect';
    dialog.innerHTML = '<form><h2>Connect your player</h2><p>Use a one-time code from account or family controls.</p>' +
      '<label>Device code<input required pattern="[a-f0-9]{40}" autocomplete="off"></label>' +
      '<button type="submit" class="big pink">Connect</button><button type="button" class="big ghost" data-cancel>Cancel</button>' +
      '<a href="crew.html#parents">Open account and family controls</a><p role="status"></p></form>';
    document.body.append(dialog);
    dialog.showModal();
    return new Promise((resolve, reject) => {
      const cancel = () => {
        dialog.remove();
        reject(Error('player_connection_cancelled'));
      };
      dialog.oncancel = cancel;
      dialog.querySelector('[data-cancel]').onclick = cancel;
      dialog.querySelector('form').onsubmit = async event => {
        event.preventDefault();
        const button = dialog.querySelector('[type=submit]');
        button.disabled = true;
        try {
          const data = await request('pair', {operation: 'redeem', code: dialog.querySelector('input').value.trim()});
          if (!dialog.isConnected) {
            await request('action', {operation:'logout', request:crypto.randomUUID(), data:{}}, data.token);
            return;
          }
          setSession(data);
          dialog.remove();
          resolve(current());
        } catch (error) {
          dialog.querySelector('[role=status]').textContent = error.message.replaceAll('_', ' ');
          button.disabled = false;
        }
      };
    });
  }

  async function connect() {
    if (current()) return current();
    if (!connecting) connecting = (async () => (await restore()) || showPairing())().finally(() => { connecting = null; });
    return connecting;
  }

  async function logout() {
    const prior = current();
    save(null);
    if (prior) await request('action', {operation:'logout', request:crypto.randomUUID(), data:{}}, prior.token);
  }

  async function api(path, data, privateCall = true, owner = null) {
    const person = privateCall ? await connect() : null;
    if (owner && person?.participant !== owner) throw Error('account_changed');
    return request(path, data, person?.token);
  }

  window.NuggetfinderParticipant = {
    enabled, current, restore, connect, setSession, logout, clear: () => save(null),
    api, request, token: async () => (await connect()).token
  };
})();
