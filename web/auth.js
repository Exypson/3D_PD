'use strict';
// Demo accounts, stored in this browser only.
// shortcut: client-side accounts have no real security and don't sync across devices; replace with Supabase Auth before launch (same async signUp/signIn/signOut shape).
const Auth = (() => {
  const USERS = 'pd3d_users', SESSION = 'pd3d_session';
  const read = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const hex = b => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
  async function hash(pw, salt){
    if (!crypto.subtle) throw new Error('Accounts need HTTPS or localhost.');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
    return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000 }, key, 256));
  }
  return {
    user(){ return read(SESSION); },
    displayName(){ const id = read(SESSION); const u = id && (read(USERS) || {})[id]; return u ? u.name : ''; },
    async signUp(name, pw){
      name = name.trim();
      if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) throw new Error('Username: 3 to 20 letters, numbers or underscores.');
      if (pw.length < 6) throw new Error('Password: at least 6 characters.');
      const users = read(USERS) || {}, id = name.toLowerCase();
      if (users[id]) throw new Error('That username is taken.');
      const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
      users[id] = { name, salt, hash: await hash(pw, salt), created: Date.now() };
      if (!write(USERS, users)) throw new Error('This browser is blocking storage, so the account could not be saved.');
      write(SESSION, id);
      return id;
    },
    async signIn(name, pw){
      const id = name.trim().toLowerCase(), u = (read(USERS) || {})[id];
      if (!u || u.hash !== await hash(pw, u.salt)) throw new Error('Wrong username or password.');
      write(SESSION, id);
      return id;
    },
    signOut(){ try { localStorage.removeItem(SESSION); } catch (e) {} }
  };
})();
