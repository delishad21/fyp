export function formatUserResponse(user: any) {
  return {
    id: user.id,
    name: user.name,
    honorific: user.honorific,
    username: user.username,
    email: user.email,
    isAdmin: user.isAdmin,
    isVerified: user.isVerified,
    createdAt: user.createdAt,
  };
}
