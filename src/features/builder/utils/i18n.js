function interpolate(template, vars = {}) {
  if (template == null) return '';
  let out = String(template);
  if (vars && typeof vars === 'object') {
    for (const [k, v] of Object.entries(vars)) {
      out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}}`, 'g'), String(v));
    }
  }
  return out;
}

function fallbackT(key, vars = {}, fallback = null) {
  // Minimal fallback: return provided fallback or key.
  if (fallback != null) return interpolate(fallback, vars);
  return interpolate(key, vars);
}

function makeTranslator(lang, locale, fallbacks = null) {
  return (key, vars = {}, fallback) => {
    const fb = fallback != null ? fallback : (fallbacks && fallbacks[key]);
    if (!lang) return fallbackT(key, vars, fb);
    const translated = lang.t(key, vars, locale);
    if (translated === key && fb != null) return interpolate(fb, vars);
    return translated;
  };
}

async function resolveInteractionLocale(interaction, { publicResponse = false } = {}) {
  const lang = interaction && interaction.client ? interaction.client.language : null;
  if (!lang) return { lang: null, locale: 'en-US', t: makeTranslator(null, 'en-US') };
  const userId = !publicResponse && interaction && interaction.user ? interaction.user.id : null;
  const guildId = interaction ? (interaction.guildId || (interaction.guild ? interaction.guild.id : null)) : null;
  let locale = 'en-US';
  try {
    locale = await lang.resolve({ userId: userId || undefined, guildId: guildId || undefined });
  } catch {
    locale = lang.getDefaultLocale ? lang.getDefaultLocale() : 'en-US';
  }
  return { lang, locale, t: makeTranslator(lang, locale) };
}

function sessionTranslator(session, lang, fallbacks = null) {
  const locale = (session && session.locale) || (lang && lang.getDefaultLocale ? lang.getDefaultLocale() : 'en-US');
  if (!lang) return { locale, t: makeTranslator(null, locale, fallbacks) };
  return { locale, t: makeTranslator(lang, locale, fallbacks) };
}

module.exports = { resolveInteractionLocale, sessionTranslator, makeTranslator, fallbackT, interpolate };