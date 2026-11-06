// People (MolcaDx MAM): who does the work, their craft, skills, shift and internal hourly rate. Never deleted,
// only deactivated (`validTo`), so labour booked against a person keeps its name and rate.
type Person = {
  id: string;
  code: string;
  name: string;
  /** The sign-in name (Keycloak preferred_username); "" = no sign-in. */
  username: string;
  craft: string;
  skills: string[];
  siteId: string;
  shift: string;
  /** Internal cost per hour in the tenant's currency; null = not set. */
  hourlyRate: string | null;
  phone: string;
  validFrom: string;
  validTo: string | null;
};

type CreatePerson = Omit<Person, "id" | "validFrom" | "validTo">;
type UpdatePerson = Partial<CreatePerson>;

export type { CreatePerson, Person, UpdatePerson };
