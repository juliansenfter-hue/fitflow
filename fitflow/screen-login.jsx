/* FitFlow — Login & Registration.
   A clean, centred glass card over the blurred dashboard teaser. Toggles
   between "Anmelden" and "Konto erstellen". On success the session opens and
   the real app reveals — a fresh registration starts empty and offers the
   guided tour. Social buttons are visual only. */
(function () {
  const { createElement: h, useState, useRef } = React;
  const Icon = window.Icon;
  const Auth = window.FFAuth;

  function BrandApple() {
    return h('svg', { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true },
      h('path', { d: 'M16.36 12.78c.02 2.46 2.16 3.28 2.18 3.29-.02.06-.34 1.17-1.13 2.31-.68.99-1.39 1.97-2.5 1.99-1.1.02-1.45-.65-2.7-.65-1.26 0-1.65.63-2.69.67-1.08.04-1.9-1.07-2.58-2.05-1.4-2.02-2.46-5.7-1.03-8.19.71-1.23 1.98-2.01 3.36-2.03 1.06-.02 2.06.71 2.7.71.64 0 1.86-.88 3.14-.75.53.02 2.03.21 2.99 1.62-.08.05-1.79 1.04-1.77 3.1M14.3 5.36c.57-.69.95-1.65.85-2.61-.82.03-1.81.55-2.4 1.23-.53.61-.99 1.58-.87 2.52.91.07 1.85-.46 2.42-1.14' }));
  }
  function BrandGoogle() {
    return h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', 'aria-hidden': true },
      h('path', { fill: '#4285F4', d: 'M22.5 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.9a5.05 5.05 0 01-2.19 3.31v2.77h3.54c2.08-1.92 3.25-4.74 3.25-8.09z' }),
      h('path', { fill: '#34A853', d: 'M12 23c2.97 0 5.46-.98 7.28-2.66l-3.54-2.77c-.98.66-2.23 1.06-3.74 1.06-2.87 0-5.3-1.94-6.17-4.55H2.18v2.86A11 11 0 0012 23z' }),
      h('path', { fill: '#FBBC05', d: 'M5.83 14.08a6.6 6.6 0 010-4.16V7.06H2.18a11 11 0 000 9.88l3.65-2.86z' }),
      h('path', { fill: '#EA4335', d: 'M12 4.75c1.62 0 3.07.56 4.21 1.65l3.14-3.14C17.45 1.46 14.96.5 12 .5A11 11 0 002.18 7.06l3.65 2.86C6.7 7.31 9.13 4.75 12 4.75z' }));
  }

  // a labelled glass input with icon + optional trailing slot
  function LField({ label, icon, type, value, onChange, placeholder, err, autoFocus, autoComplete, trailing, right }) {
    return h('label', { className: 'ff-login-field' },
      right
        ? h('div', { className: 'ff-login-labelrow' }, h('span', { className: 'ff-login-label' }, label), right)
        : h('span', { className: 'ff-login-label' }, label),
      h('div', { className: 'ff-login-input' + (err ? ' is-err' : '') },
        icon && h(Icon, { name: icon, size: 17 }),
        h('input', { type: type || 'text', value, onChange, placeholder, autoFocus, autoComplete }),
        trailing));
  }

  function LoginScreen({ onSuccess }) {
    const [mode, setMode] = useState('login');         // 'login' | 'register'
    const [show, setShow] = useState(false);
    const [err, setErr] = useState(null);              // { field, error }
    const [ok, setOk] = useState(false);
    const [hint, setHint] = useState(false);

    // login fields
    const [email, setEmail] = useState(Auth ? Auth.get().email : '');
    const [pw, setPw] = useState('');
    // register fields
    const [rName, setRName] = useState('');
    const [rEmail, setREmail] = useState('');
    const [rPw, setRPw] = useState('');
    const [rPw2, setRPw2] = useState('');
    const [rSport, setRSport] = useState('');

    const finish = (res) => {
      setErr(null); setOk(true);
      setTimeout(() => onSuccess(res), 640);
    };

    const submitLogin = (e) => {
      e && e.preventDefault(); if (ok) return;
      const res = Auth.login(email, pw);
      if (!res.ok) { setErr(res); return; }
      finish(res);
    };
    const submitRegister = (e) => {
      e && e.preventDefault(); if (ok) return;
      const res = Auth.register({ name: rName, email: rEmail, password: rPw, password2: rPw2, sport: rSport });
      if (!res.ok) { setErr(res); return; }
      finish(res);
    };

    const fillDemo = () => { setMode('login'); setEmail(Auth.get().email); setPw('fitflow'); setErr(null); setHint(false); };
    const toggle = (m) => { setMode(m); setErr(null); setHint(false); };
    const eye = (on, set) => h('button', { type: 'button', className: 'ff-login-eye', tabIndex: -1,
      onClick: () => set((v) => !v), title: on ? 'Verbergen' : 'Anzeigen' }, h(Icon, { name: on ? 'eyeOff' : 'eye', size: 17 }));

    const isReg = mode === 'register';

    return h('div', { className: 'ff-login' + (ok ? ' is-ok' : '') },
      h('div', { className: 'ff-login-scrim' }),
      h('form', { className: 'ff-login-card', onSubmit: isReg ? submitRegister : submitLogin, noValidate: true },
        h('div', { className: 'ff-login-brand' }, h('div', { className: 'ff-login-word' }, 'FitFlow')),
        h('h1', { className: 'ff-login-title' }, isReg ? 'Konto erstellen' : 'Willkommen zurück'),
        h('p', { className: 'ff-login-sub' }, isReg
          ? 'Lege ein neues Profil an — du startest mit einem leeren Trainingstagebuch.'
          : 'Melde dich an, um deine Trainingssteuerung zu öffnen.'),

        isReg
          // ---------- REGISTER ----------
          ? h('div', { className: 'ff-login-fields' },
              h(LField, { label: 'Name', icon: 'profile', value: rName, autoFocus: true, placeholder: 'Dein Name',
                err: err && err.field === 'name', onChange: (e) => { setRName(e.target.value); setErr(null); } }),
              h(LField, { label: 'E-Mail', icon: 'mail', type: 'email', autoComplete: 'email', value: rEmail, placeholder: 'name@beispiel.com',
                err: err && err.field === 'email', onChange: (e) => { setREmail(e.target.value); setErr(null); } }),
              h(LField, { label: 'Passwort', icon: 'lock', type: show ? 'text' : 'password', value: rPw, placeholder: 'mind. 6 Zeichen',
                err: err && err.field === 'password', onChange: (e) => { setRPw(e.target.value); setErr(null); }, trailing: eye(show, setShow) }),
              h(LField, { label: 'Passwort bestätigen', icon: 'lock', type: show ? 'text' : 'password', value: rPw2, placeholder: '••••••••',
                err: err && err.field === 'password2', onChange: (e) => { setRPw2(e.target.value); setErr(null); } }),
              h('label', { className: 'ff-login-field' },
                h('span', { className: 'ff-login-label' }, 'Sportart / Ziel ', h('span', { style: { color: 'var(--text-4)', fontWeight: 500 } }, '· optional')),
                h('div', { className: 'ff-login-input' },
                  h(Icon, { name: 'target', size: 17 }),
                  h('input', { type: 'text', value: rSport, placeholder: 'z. B. Triathlon · Sub-3 Marathon', onChange: (e) => setRSport(e.target.value) }))),
              err && err.error && h('div', { className: 'ff-login-err' }, h(Icon, { name: 'info', size: 14 }), h('span', null, err.error)))
          // ---------- LOGIN ----------
          : h('div', { className: 'ff-login-fields' },
              h(LField, { label: 'E-Mail', icon: 'mail', type: 'email', autoComplete: 'username', value: email, placeholder: 'name@beispiel.com',
                err: err && err.field === 'email', onChange: (e) => { setEmail(e.target.value); setErr(null); } }),
              h(LField, { label: 'Passwort', icon: 'lock', type: show ? 'text' : 'password', autoComplete: 'current-password', value: pw, placeholder: '••••••••',
                err: err && err.field === 'password', onChange: (e) => { setPw(e.target.value); setErr(null); }, trailing: eye(show, setShow),
                right: h('button', { type: 'button', className: 'ff-login-forgot', onClick: () => setHint((v) => !v) }, 'Passwort vergessen?') }),
              hint && h('div', { className: 'ff-login-note' },
                h(Icon, { name: 'info', size: 14 }),
                h('span', null, 'Demo-Konto — Passwort ', h('strong', null, 'fitflow'), '. ',
                  h('button', { type: 'button', className: 'ff-login-link', onClick: fillDemo }, 'Automatisch einsetzen'))),
              err && err.error && h('div', { className: 'ff-login-err' }, h(Icon, { name: 'info', size: 14 }), h('span', null, err.error))),

        h('button', { type: 'submit', className: 'ff-login-submit' + (ok ? ' is-ok' : ''), disabled: ok },
          ok ? h(Icon, { name: 'check', size: 18 }) : null,
          ok ? (isReg ? 'Konto erstellt' : 'Angemeldet') : (isReg ? 'Konto erstellen' : 'Anmelden')),

        h('div', { className: 'ff-login-or' }, h('span', null, 'oder')),

        h('div', { className: 'ff-login-social' },
          h('button', { type: 'button', className: 'ff-login-soc' }, h(BrandApple), 'Apple'),
          h('button', { type: 'button', className: 'ff-login-soc' }, h(BrandGoogle), 'Google')),

        h('div', { className: 'ff-login-foot' }, isReg
          ? h(Fragment2, null, 'Schon ein Konto? ', h('button', { type: 'button', className: 'ff-login-link', onClick: () => toggle('login') }, 'Anmelden'))
          : h(Fragment2, null, 'Neu hier? ', h('button', { type: 'button', className: 'ff-login-link', onClick: () => toggle('register') }, 'Konto erstellen')))));
  }

  // tiny fragment helper to avoid pulling Fragment into deps above
  function Fragment2(props) { return h(React.Fragment, null, props.children); }

  window.LoginScreen = LoginScreen;
})();
