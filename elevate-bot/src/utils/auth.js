function isAuthorized(interaction) {
  const { member, guild } = interaction;
  return (
    guild.ownerId === member.id ||
    member.roles.cache.has(process.env.ADMIN_ROLE_ID) ||
    (process.env.MOD_PRO_ROLE_ID && member.roles.cache.has(process.env.MOD_PRO_ROLE_ID))
  );
}

module.exports = { isAuthorized };
