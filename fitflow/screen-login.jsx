/* FitFlow — Login, Registrierung & Passwort-Reset (Supabase).
   A clean, centred glass card over the blurred dashboard teaser. Modes:
   'login' | 'register' | 'forgot'. Auth calls are async (FFAuth → Supabase).
   ResetPasswordScreen is shown by Root when the user returns via a reset link. */
(function () {
  const { createElement: h, useState, Fragment } = React;
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

  const eyeBtn = (on, set) => h('button', { type: 'button', className: 'ff-login-eye', tabIndex: -1,
    onClick: () => set((v) => !v), title: on ? 'Verbergen' : 'Anzeigen' }, h(Icon, { name: on ? 'eyeOff' : 'eye', size: 17 }));

  function LoginScreen({ onSuccess }) {
    const [mode, setMode] = useState('login');        // 'login' | 'register' | 'forgot'
    const [show, setShow] = useState(false);
    const [err, setErr] = useState(null);             // { field, error }
    const [ok, setOk] = useState(false);              // login/register success → animate then onSuccess
    const [busy, setBusy] = useState(false);          // request in flight
    const [info, setInfo] = useState(null);           // { kind:'confirm'|'sent', text }

    // login fields
    const [email, setEmail] = useState('');
    const [pw, setPw] = useState('');
    // register fields
    const [rName, setRName] = useState('');
    const [rEmail, setREmail] = useState('');
    const [rPw, setRPw] = useState('');
    const [rPw2, setRPw2] = useState('');
    const [rSport, setRSport] = useState('');
    // forgot fields (E-Mail → 6-stelliger Code → [Root] neues Passwort)
    const [fEmail, setFEmail] = useState('');
    const [fStep, setFStep] = useState('email');      // 'email' | 'code'
    const [fCode, setFCode] = useState('');

    const finish = (res) => { setErr(null); setBusy(false); setOk(true); setTimeout(() => onSuccess(res), 640); };
    const fail = (res) => { setErr(res); setBusy(false); };

    const submitLogin = async (e) => {
      e && e.preventDefault(); if (ok || busy) return;
      setBusy(true); setErr(null); setInfo(null);
      const res = await Auth.login(email, pw);
      if (!res.ok) return fail(res);
      finish(res);
    };
    const submitRegister = async (e) => {
      e && e.preventDefault(); if (ok || busy) return;
      setBusy(true); setErr(null); setInfo(null);
      const res = await Auth.register({ name: rName, email: rEmail, password: rPw, password2: rPw2, sport: rSport });
      if (!res.ok) return fail(res);
      if (res.needConfirm) { // e-mail confirmation required → can't open the session yet
        setBusy(false);
        setInfo({ kind: 'confirm', text: `Wir haben dir eine Bestätigungs-Mail an ${res.email} geschickt. Bestätige sie und melde dich dann an.` });
        setMode('login'); setEmail(rEmail); setPw('');
        return;
      }
      finish(res);
    };
    const submitForgot = async (e) => {
      e && e.preventDefault(); if (busy) return;
      setBusy(true); setErr(null); setInfo(null);
      const res = await Auth.resetPassword(fEmail);
      setBusy(false);
      if (!res.ok) return setErr(res);
      setFStep('code');
      setInfo({ kind: 'sent', text: `Falls ein Konto zu ${fEmail} existiert, kommt gleich ein 6-stelliger Code per E-Mail.` });
    };
    const submitCode = async (e) => {
      e && e.preventDefault(); if (busy) return;
      setBusy(true); setErr(null);
      const res = await Auth.verifyResetCode(fEmail, fCode);
      if (!res.ok) { setBusy(false); return setErr(res); }
      // Code ok → Recovery-Session offen; Root zeigt jetzt den „Neues Passwort"-Screen
    };

    const goMode = (m) => { setMode(m); setErr(null); setInfo(null); setOk(false);
      if (m === 'forgot') { setFStep('email'); setFCode(''); } };
    const fillDemo = () => { goMode('login'); setEmail(Auth ? Auth.get().email || 'julian.senfter@gmail.com' : ''); setPw('fitflow'); };
    const startTest = async () => {
      if (ok || busy) return;
      setErr(null); setInfo(null);
      if (Auth && Auth.loginTest) { const res = await Auth.loginTest(); finish(res); }
    };
    const submitOAuth = async (provider) => {
      if (ok || busy) return;
      setBusy(true); setErr(null); setInfo(null);
      const res = await Auth.oauth(provider);
      // success → the browser navigates to the provider (res.redirecting); on return
      // the session opens automatically. Only an error lands back here.
      if (!res.ok) return fail(res);
    };

    const isReg = mode === 'register';
    const isForgot = mode === 'forgot';

    const infoBox = info && h('div', { className: 'ff-login-note' + (info.kind === 'sent' ? ' is-ok' : '') },
      h(Icon, { name: info.kind === 'sent' ? 'check' : 'mail', size: 14 }), h('span', null, info.text));
    const errBox = err && err.error && h('div', { className: 'ff-login-err' }, h(Icon, { name: 'info', size: 14 }), h('span', null, err.error));

    // ---------- FORGOT PASSWORD (E-Mail → 6-stelliger Code) ----------
    if (isForgot) {
      const isCode = fStep === 'code';
      return h('div', { className: 'ff-login' },
        h('div', { className: 'ff-login-scrim' }),
        h('form', { className: 'ff-login-card', onSubmit: isCode ? submitCode : submitForgot, noValidate: true },
          h('div', { className: 'ff-login-brand' }, h('div', { className: 'ff-login-word' }, 'FitFlow')),
          h('h1', { className: 'ff-login-title' }, isCode ? 'Code eingeben' : 'Passwort zurücksetzen'),
          h('p', { className: 'ff-login-sub' }, isCode
            ? `Gib den 6-stelligen Code ein, den wir an ${fEmail} geschickt haben.`
            : 'Gib deine E-Mail ein — wir schicken dir einen 6-stelligen Code zum Zurücksetzen.'),
          h('div', { className: 'ff-login-fields' },
            isCode
              ? h(LField, { label: 'Code', icon: 'lock', type: 'text', value: fCode, autoFocus: true, placeholder: '123456', autoComplete: 'one-time-code',
                  err: err && !!err.error, onChange: (e) => { setFCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr(null); } })
              : h(LField, { label: 'E-Mail', icon: 'mail', type: 'email', autoComplete: 'email', value: fEmail, autoFocus: true, placeholder: 'name@beispiel.com',
                  err: err && err.field === 'email', onChange: (e) => { setFEmail(e.target.value); setErr(null); } }),
            infoBox, errBox),
          h('button', { type: 'submit', className: 'ff-login-submit', disabled: busy || (isCode && fCode.length < 6) },
            busy ? (isCode ? 'Prüfen …' : 'Senden …') : (isCode ? 'Code bestätigen' : 'Code senden')),
          h('div', { className: 'ff-login-foot' },
            h('button', { type: 'button', className: 'ff-login-link',
              onClick: () => { if (isCode) { setFStep('email'); setErr(null); setInfo(null); } else goMode('login'); } },
              isCode ? '← E-Mail ändern' : '← Zurück zur Anmeldung'))));
    }

    // ---------- LOGIN / REGISTER ----------
    return h('div', { className: 'ff-login' + (ok ? ' is-ok' : '') },
      h('div', { className: 'ff-login-scrim' }),
      h('form', { className: 'ff-login-card', onSubmit: isReg ? submitRegister : submitLogin, noValidate: true },
        h('div', { className: 'ff-login-brand' }, h('div', { className: 'ff-login-word' }, 'FitFlow')),
        h('h1', { className: 'ff-login-title' }, isReg ? 'Konto erstellen' : 'Willkommen zurück'),
        h('p', { className: 'ff-login-sub' }, isReg
          ? 'Lege ein neues Profil an — du startest mit einem leeren Trainingstagebuch.'
          : 'Melde dich an, um deine Trainingssteuerung zu öffnen.'),

        isReg
          ? h('div', { className: 'ff-login-fields' },
              h(LField, { label: 'Name', icon: 'profile', value: rName, autoFocus: true, placeholder: 'Dein Name',
                err: err && err.field === 'name', onChange: (e) => { setRName(e.target.value); setErr(null); } }),
              h(LField, { label: 'E-Mail', icon: 'mail', type: 'email', autoComplete: 'email', value: rEmail, placeholder: 'name@beispiel.com',
                err: err && err.field === 'email', onChange: (e) => { setREmail(e.target.value); setErr(null); } }),
              h(LField, { label: 'Passwort', icon: 'lock', type: show ? 'text' : 'password', value: rPw, placeholder: 'mind. 6 Zeichen',
                err: err && err.field === 'password', onChange: (e) => { setRPw(e.target.value); setErr(null); }, trailing: eyeBtn(show, setShow) }),
              h(LField, { label: 'Passwort bestätigen', icon: 'lock', type: show ? 'text' : 'password', value: rPw2, placeholder: '••••••••',
                err: err && err.field === 'password2', onChange: (e) => { setRPw2(e.target.value); setErr(null); } }),
              h('label', { className: 'ff-login-field' },
                h('span', { className: 'ff-login-label' }, 'Sportart / Ziel ', h('span', { style: { color: 'var(--text-4)', fontWeight: 500 } }, '· optional')),
                h('div', { className: 'ff-login-input' },
                  h(Icon, { name: 'target', size: 17 }),
                  h('input', { type: 'text', value: rSport, placeholder: 'z. B. Triathlon · Sub-3 Marathon', onChange: (e) => setRSport(e.target.value) }))),
              errBox)
          : h('div', { className: 'ff-login-fields' },
              h(LField, { label: 'E-Mail', icon: 'mail', type: 'email', autoComplete: 'username', value: email, autoFocus: true, placeholder: 'name@beispiel.com',
                err: err && err.field === 'email', onChange: (e) => { setEmail(e.target.value); setErr(null); } }),
              h(LField, { label: 'Passwort', icon: 'lock', type: show ? 'text' : 'password', autoComplete: 'current-password', value: pw, placeholder: '••••••••',
                err: err && err.field === 'password', onChange: (e) => { setPw(e.target.value); setErr(null); }, trailing: eyeBtn(show, setShow),
                right: h('button', { type: 'button', className: 'ff-login-forgot', onClick: () => goMode('forgot') }, 'Passwort vergessen?') }),
              infoBox, errBox),

        h('button', { type: 'submit', className: 'ff-login-submit' + (ok ? ' is-ok' : ''), disabled: ok || busy },
          ok ? h(Icon, { name: 'check', size: 18 }) : null,
          ok ? (isReg ? 'Konto erstellt' : 'Angemeldet') : busy ? (isReg ? 'Konto wird erstellt …' : 'Anmelden …') : (isReg ? 'Konto erstellen' : 'Anmelden')),

        h('div', { className: 'ff-login-or' }, h('span', null, 'oder')),
        h('div', { className: 'ff-login-social' },
          h('button', { type: 'button', className: 'ff-login-soc', disabled: ok || busy, onClick: () => submitOAuth('apple') }, h(BrandApple), 'Apple'),
          h('button', { type: 'button', className: 'ff-login-soc', disabled: ok || busy, onClick: () => submitOAuth('google') }, h(BrandGoogle), 'Google')),
        h('div', { className: 'ff-login-demo' },
          h('button', { type: 'button', className: 'ff-login-link', onClick: fillDemo }, 'Demo ansehen (ohne Konto)'),
          h('span', { className: 'ff-login-demo-sep', 'aria-hidden': true }, '\u00b7'),
          h('button', { type: 'button', className: 'ff-login-link', onClick: startTest }, 'Onboarding testen (leeres Konto)')),

        h('div', { className: 'ff-login-foot' }, isReg
          ? h(Fragment, null, 'Schon ein Konto? ', h('button', { type: 'button', className: 'ff-login-link', onClick: () => goMode('login') }, 'Anmelden'))
          : h(Fragment, null, 'Neu hier? ', h('button', { type: 'button', className: 'ff-login-link', onClick: () => goMode('register') }, 'Konto erstellen')))));
  }

  /* Shown by Root when the user returns via a password-reset link
     (Supabase fired PASSWORD_RECOVERY). Sets a new password, then continues. */
  function ResetPasswordScreen({ onDone }) {
    const { useState } = React;
    const [pw, setPw] = useState('');
    const [pw2, setPw2] = useState('');
    const [show, setShow] = useState(false);
    const [err, setErr] = useState(null);
    const [busy, setBusy] = useState(false);
    const [ok, setOk] = useState(false);

    const submit = async (e) => {
      e && e.preventDefault(); if (busy || ok) return;
      if (pw.length < 6) return setErr({ error: 'Das neue Passwort braucht mindestens 6 Zeichen.' });
      if (pw !== pw2) return setErr({ error: 'Die Passwörter stimmen nicht überein.' });
      setBusy(true); setErr(null);
      const res = await Auth.updatePassword(pw);
      if (!res.ok) { setBusy(false); return setErr(res); }
      setBusy(false); setOk(true);
      setTimeout(() => onDone && onDone(), 800);
    };

    return h('div', { className: 'ff-login' + (ok ? ' is-ok' : '') },
      h('div', { className: 'ff-login-scrim' }),
      h('form', { className: 'ff-login-card', onSubmit: submit, noValidate: true },
        h('div', { className: 'ff-login-brand' }, h('div', { className: 'ff-login-word' }, 'FitFlow')),
        h('h1', { className: 'ff-login-title' }, 'Neues Passwort setzen'),
        h('p', { className: 'ff-login-sub' }, 'Wähle ein neues Passwort für dein Konto.'),
        h('div', { className: 'ff-login-fields' },
          h(LField, { label: 'Neues Passwort', icon: 'lock', type: show ? 'text' : 'password', value: pw, autoFocus: true, placeholder: 'mind. 6 Zeichen',
            onChange: (e) => { setPw(e.target.value); setErr(null); }, trailing: eyeBtn(show, setShow) }),
          h(LField, { label: 'Passwort bestätigen', icon: 'lock', type: show ? 'text' : 'password', value: pw2, placeholder: '••••••••',
            onChange: (e) => { setPw2(e.target.value); setErr(null); } }),
          err && err.error && h('div', { className: 'ff-login-err' }, h(Icon, { name: 'info', size: 14 }), h('span', null, err.error))),
        h('button', { type: 'submit', className: 'ff-login-submit' + (ok ? ' is-ok' : ''), disabled: busy || ok },
          ok ? h(Icon, { name: 'check', size: 18 }) : null,
          ok ? 'Passwort geändert' : busy ? 'Speichern …' : 'Passwort speichern')));
  }

  window.LoginScreen = LoginScreen;
  window.ResetPasswordScreen = ResetPasswordScreen;
})();
