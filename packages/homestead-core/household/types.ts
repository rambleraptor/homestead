/**
 * The household: the people who share this Homestead. Everyone holding a
 * household role (Admin or Member, through any group) and every superuser — not
 * guests, and not accounts without a role.
 *
 * Every member may see the others' names, so the household can be addressed by
 * name (in the assistant, in the share picker). Emails stay private.
 */

/** The roles that make an account part of the household (`permissions/seed.ts`). */
export const HOUSEHOLD_ROLES: readonly string[] = ['admin', 'member'];

export interface HouseholdMember {
  /** The user id: what `created_by` and other user references hold. */
  id: string;
  /** Their display name, or their email's local part when they have none. */
  name: string;
  /** A superuser or an Admin. */
  admin: boolean;
}
