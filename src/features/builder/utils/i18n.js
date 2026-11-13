function fallbackT(key, vars = {}, locale = 'en-US') {
  // Minimal fallback: return key; callers should provide English defaults when needed.
  if (vars && typeof vars === 'object') {
    let out = key;
    for (const [k, v] of Object.entries(vars)) {
      out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}}`, 'g'), String(v));
    }
    return out;
  }
  return key;
}

async function resolveInteractionLocale(interaction, { preferUser = true } = {}) {
  const lang = interaction && interaction.client ? interaction.client.language : null;
  if (!lang) return { lang: null, locale: 'en-US', t: (k, v) => fallbackT(k, v, 'en-US') };
  const userId = preferUser && interaction.user ? interaction.user.id : null;
  const guildId = interaction.guildId || (interaction.guild ? interaction.guild.id : null);
  let locale = 'en-US';
  try {
    locale = await lang.resolve({ userId: userId || undefined, guildId: guildId || undefined });
  } catch {
    locale = lang.getDefaultLocale ? lang.getDefaultLocale() : 'en-US';
  }
  const t = (key, vars) => lang.t(key, vars, locale);
  return { lang, locale, t };
}

function sessionTranslator(session, lang) {
  const locale = (session && session.locale) || (lang && lang.getDefaultLocale ? lang.getDefaultLocale() : 'en-US');
  if (!lang) return { locale, t: (k, v) => fallbackT(k, v, locale) };
  const t = (key, vars) => lang.t(key, vars, locale);
  return { locale, t };
}

module.exports = { resolveInteractionLocale, sessionTranslator, fallbackT };