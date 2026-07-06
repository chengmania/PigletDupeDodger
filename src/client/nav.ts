export interface NavLink {
  href: string;
  label: string;
  disabled: boolean;
}

// Pure so the Log link's enabled state is recomputed fresh from live state
// on every render, never a snapshot taken at mount time.
//
// Exports/Leaderboard/Host Setup entries are still included here -- those
// screens aren't removed until later Change Order milestones (CO-6/CO-9),
// so this keeps them reachable in the meantime.
export function navLinks(hasReservation: boolean, showHostSetup: boolean): NavLink[] {
  const links: NavLink[] = [
    { href: '#/grid', label: 'Grid', disabled: false },
    { href: '#/log', label: 'Log', disabled: !hasReservation },
    { href: '#/dashboard', label: 'Dashboard', disabled: false },
    { href: '#/exports', label: 'Exports', disabled: false },
    { href: '#/leaderboard', label: 'Leaderboard', disabled: false },
  ];
  if (showHostSetup) links.push({ href: '#/setup', label: 'Host Setup', disabled: false });
  return links;
}
