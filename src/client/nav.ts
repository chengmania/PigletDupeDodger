export interface NavLink {
  href: string;
  label: string;
  disabled: boolean;
}

// Pure so the Log link's enabled state is recomputed fresh from live state
// on every render, never a snapshot taken at mount time.
//
// Exports/Leaderboard are still included here -- those screens aren't
// removed from the operator nav until CO-6 (a later Change Order
// milestone). Host Setup is gone for good: club config/bonus checklist now
// live exclusively under Captain's Station (/captain).
export function navLinks(hasReservation: boolean): NavLink[] {
  return [
    { href: '#/grid', label: 'Grid', disabled: false },
    { href: '#/log', label: 'Log', disabled: !hasReservation },
    { href: '#/dashboard', label: 'Dashboard', disabled: false },
    { href: '#/exports', label: 'Exports', disabled: false },
    { href: '#/leaderboard', label: 'Leaderboard', disabled: false },
  ];
}
