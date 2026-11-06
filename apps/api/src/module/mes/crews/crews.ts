// A crew (regu) of people on a site and shift under a leader (MolcaDx MAM). Never deleted, only deactivated.
type Crew = {
  id: string;
  code: string;
  name: string;
  siteId: string;
  shift: string;
  /** person id of the leader; "" = none */
  leaderId: string;
  memberIds: string[];
  validFrom: string;
  validTo: string | null;
};

type CreateCrew = Omit<Crew, "id" | "validFrom" | "validTo">;
type UpdateCrew = Partial<CreateCrew>;

export type { CreateCrew, Crew, UpdateCrew };
