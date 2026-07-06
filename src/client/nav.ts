export interface NavLink {
  href: string;
  label: string;
  disabled: boolean;
}

// Pure so the Log link's enabled state is recomputed fresh from live state
// on every render, never a snapshot taken at mount time.
//
// Exactly Grid|Log|Dashboard (CO-6): Exports/Leaderboard/Host Setup are all
// gone from the operator nav -- exports and club config now live
// exclusively under Captain's Station (/captain), and the dashboard itself
// carries the live feed the leaderboard used to show (CO-7).
export function navLinks(hasReservation: boolean): NavLink[] {
  return [
    { href: '#/grid', label: 'Grid', disabled: false },
    { href: '#/log', label: 'Log', disabled: !hasReservation },
    { href: '#/dashboard', label: 'Dashboard', disabled: false },
  ];
}
