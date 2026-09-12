export const browserCookieName = "ah_browser";
export function deletionCookieName(id: string) { return `ah_delete_${id}`; }

export const baseCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const
};
