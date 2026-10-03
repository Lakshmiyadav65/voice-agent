/**
 * Staff open a client's dashboard by setting this cookie to the business's id (from
 * /admin's "View dashboard"). It is only a choice of which business to show: every
 * read still checks that the signed-in user is staff, so the cookie does nothing for
 * a client. Plain constants, so the proxy can import it too.
 */
export const STAFF_VIEW_COOKIE = "staff_view_business";

/** How long a view lasts before staff land back in their own console. */
export const STAFF_VIEW_MAX_AGE_SECONDS = 8 * 60 * 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseStaffViewCookie(value: string | undefined): string | null {
  return value && UUID.test(value) ? value : null;
}
