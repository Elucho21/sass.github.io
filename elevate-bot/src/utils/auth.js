function isAuthorized(interaction) {
  const { member, guild, user } = interaction;

  // IDs de usuario autorizados directamente (separados por coma en OWNER_USER_IDS)
  const ownerIds = (process.env.OWNER_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

  return (
    guild.ownerId === user.id ||
    ownerIds.includes(user.id) ||
    member.roles.cache.has(process.env.ADMIN_ROLE_ID) ||
    (process.env.MOD_PRO_ROLE_ID && member.roles.cache.has(process.env.MOD_PRO_ROLE_ID))
  );
}

module.exports = { isAuthorized };
