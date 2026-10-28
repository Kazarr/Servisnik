/** The addresses of the pages of a Príjem vozidla, which the pages and the forms they hold link to each other by. */
export const intakePaths = {
  /** The page that finds a Vozidlo, or goes on to a new one. */
  start: '/zakazky/nova',
  /** The form of a Zákazka for the Vozidlo with this id. */
  forVehicle: (vehicleId: string) => `/zakazky/nova?vozidlo=${vehicleId}`,
  /** The page that begins a new Vozidlo by finding its Majiteľ, or by making a new Zákazník of him. */
  newVehicle: '/zakazky/nova/nove-vozidlo',
  /** The form of a new Vozidlo and its Zákazka, with the Zákazník with this id as its Majiteľ. */
  withOwner: (customerId: string) => `/zakazky/nova/nove-vozidlo?zakaznik=${customerId}`,
  /** The same form, with a new Zákazník as its Majiteľ. */
  withNewOwner: '/zakazky/nova/nove-vozidlo?novy=zakaznik',
} as const;
