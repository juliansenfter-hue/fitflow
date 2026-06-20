/* FitFlow — Supabase-Verbindung.
   Der anon-Key ist ein ÖFFENTLICHER Client-Key (darf im Code stehen) — der
   Zugriff wird über Supabase Row-Level-Security geregelt, nicht über das
   Verstecken dieses Keys. Bei Projektwechsel hier url + anonKey tauschen.

   Dashboard-Setup, das dazugehört (einmalig):
     Authentication → URL Configuration → Redirect URLs:
       https://juliansenfter-hue.github.io/fitflow/
       http://127.0.0.1:4178/FitFlow.html
*/
window.FF_SUPABASE = {
  url: 'https://aohegzhunqqdfqbrbdph.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvaGVnemh1bnFxZGZxYnJiZHBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MTYyOTUsImV4cCI6MjA5NzQ5MjI5NX0.q9tQIz9Sx3KkN4tqKhYgEnHyD8RpDcdnqb_xi8_hqdE',
};
