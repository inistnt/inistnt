// ═══════════════════════════════════════════════════════════════════
// INISTNT — Granular Permissions System
//
// Permission string format: "action:resource"
// e.g. "view:users", "manage:workers", "approve:payouts"
//
// Rules:
//   - SUPER_ADMIN → always ALL permissions (cannot be restricted)
//   - Other roles → role defaults + optional overrides in staff.permissions
//   - Staff.permissions (Json) can GRANT or REVOKE specific permissions
// ═══════════════════════════════════════════════════════════════════

export type Permission =
  // Users
  | 'view:users'     | 'manage:users'     | 'suspend:users'   | 'delete:users'
  // Workers
  | 'view:workers'   | 'manage:workers'   | 'verify:workers'  | 'suspend:workers'  | 'change:worker_tier'
  // Bookings
  | 'view:bookings'  | 'manage:bookings'  | 'refund:bookings'
  // Finance
  | 'view:finance'   | 'manage:payouts'   | 'approve:payouts' | 'manage:commission'
  // Disputes & SOS
  | 'view:disputes'  | 'manage:disputes'
  | 'view:sos'       | 'resolve:sos'
  // Admin management
  | 'view:staff'     | 'manage:staff'     | 'invite:staff'
  // Cities & Services
  | 'view:geography' | 'manage:geography' | 'manage:services'  | 'manage:pricing'
  // Marketing
  | 'view:campaigns' | 'manage:campaigns' | 'approve:campaigns'
  | 'view:coupons'   | 'manage:coupons'   | 'manage:banners'
  // Analytics & Audit
  | 'view:analytics' | 'view:audit_logs'
  // System
  | 'manage:feature_flags' | 'manage:app_versions' | 'manage:surge'
  // Uniform
  | 'view:uniform_checks'  | 'review:uniform_checks'
  // Superadmin-only
  | 'manage:system'  | 'view:all_logs'   | 'revoke:sessions';

// ─── Role default permissions ─────────────────────────────────────
export const ROLE_PERMISSIONS: Record<string, Permission[]> = {

  SUPER_ADMIN: ['*'] as any, // Gets everything — enforced in hasPermission()

  STATE_MANAGER: [
    'view:users', 'manage:users', 'suspend:users',
    'view:workers', 'manage:workers', 'verify:workers', 'suspend:workers', 'change:worker_tier',
    'view:bookings', 'manage:bookings', 'refund:bookings',
    'view:finance', 'manage:payouts', 'approve:payouts',
    'view:disputes', 'manage:disputes',
    'view:sos', 'resolve:sos',
    'view:geography', 'manage:geography',
    'view:campaigns', 'manage:campaigns',
    'view:coupons', 'manage:coupons', 'manage:banners',
    'view:analytics',
    'view:uniform_checks', 'review:uniform_checks',
    'manage:surge',
    'view:staff', 'invite:staff',
  ],

  CITY_MANAGER: [
    'view:users', 'suspend:users',
    'view:workers', 'manage:workers', 'verify:workers', 'suspend:workers',
    'view:bookings', 'manage:bookings',
    'view:finance', 'manage:payouts',
    'view:disputes', 'manage:disputes',
    'view:sos', 'resolve:sos',
    'view:campaigns', 'manage:campaigns',
    'view:coupons',
    'view:analytics',
    'view:uniform_checks', 'review:uniform_checks',
    'manage:surge',
  ],

  AREA_MANAGER: [
    'view:users',
    'view:workers', 'verify:workers',
    'view:bookings',
    'view:disputes',
    'view:sos',
    'view:analytics',
    'view:uniform_checks',
  ],

  FINANCE_ADMIN: [
    'view:users', 'view:workers', 'view:bookings',
    'view:finance', 'manage:payouts', 'approve:payouts', 'manage:commission',
    'view:analytics', 'view:audit_logs',
    'refund:bookings',
  ],

  SUPPORT_AGENT: [
    'view:users', 'view:workers', 'view:bookings',
    'view:disputes', 'manage:disputes',
    'view:sos',
    'refund:bookings',
  ],

  FIELD_SUPERVISOR: [
    'view:workers', 'verify:workers',
    'view:bookings',
    'view:uniform_checks', 'review:uniform_checks',
    'view:sos', 'resolve:sos',
  ],

  QA_ANALYST: [
    'view:users', 'view:workers', 'view:bookings',
    'view:disputes', 'view:uniform_checks',
    'view:analytics', 'view:audit_logs',
  ],

  MARKETING_MANAGER: [
    'view:campaigns', 'manage:campaigns', 'approve:campaigns',
    'view:coupons', 'manage:coupons',
    'manage:banners',
    'view:analytics',
  ],

  TECH_ADMIN: [
    'manage:feature_flags', 'manage:app_versions',
    'view:analytics', 'view:audit_logs', 'view:all_logs',
    'view:users', 'view:workers', 'view:bookings',
    'manage:services', 'manage:pricing',
    'view:geography',
  ],
};

// ─── Permission checker ───────────────────────────────────────────
export function hasPermission(
  staffRole:   string,
  permissions: Record<string, boolean> | null | undefined,
  required:    Permission,
): boolean {
  // SuperAdmin has everything
  if (staffRole === 'SUPER_ADMIN') return true;

  // Check role defaults
  const roleDefaults = ROLE_PERMISSIONS[staffRole] ?? [];
  const hasDefault   = roleDefaults.includes(required);

  // Check per-staff overrides (can grant OR revoke)
  if (permissions && typeof permissions === 'object') {
    if (required in permissions) {
      return (permissions as any)[required] === true;
    }
  }

  return hasDefault;
}

// ─── Get effective permissions for a staff member ─────────────────
export function getEffectivePermissions(
  role:        string,
  permissions: Record<string, boolean> | null | undefined,
): string[] {
  if (role === 'SUPER_ADMIN') return ['*'];

  const defaults = new Set<string>(ROLE_PERMISSIONS[role] ?? []);

  if (permissions && typeof permissions === 'object') {
    for (const [perm, granted] of Object.entries(permissions)) {
      if (granted) defaults.add(perm);
      else defaults.delete(perm);
    }
  }

  return [...defaults];
}

// ─── All available permissions (for UI dropdown) ─────────────────
export const ALL_PERMISSIONS: { key: Permission; label: string; group: string }[] = [
  // Users
  { key: 'view:users',     label: 'View Users',         group: 'Users'    },
  { key: 'manage:users',   label: 'Edit Users',         group: 'Users'    },
  { key: 'suspend:users',  label: 'Suspend Users',      group: 'Users'    },
  { key: 'delete:users',   label: 'Delete Users',       group: 'Users'    },
  // Workers
  { key: 'view:workers',         label: 'View Workers',       group: 'Workers'  },
  { key: 'manage:workers',       label: 'Edit Workers',       group: 'Workers'  },
  { key: 'verify:workers',       label: 'Verify Workers',     group: 'Workers'  },
  { key: 'suspend:workers',      label: 'Suspend Workers',    group: 'Workers'  },
  { key: 'change:worker_tier',   label: 'Change Worker Tier', group: 'Workers'  },
  // Bookings
  { key: 'view:bookings',   label: 'View Bookings',      group: 'Bookings' },
  { key: 'manage:bookings', label: 'Manage Bookings',    group: 'Bookings' },
  { key: 'refund:bookings', label: 'Process Refunds',    group: 'Bookings' },
  // Finance
  { key: 'view:finance',     label: 'View Finance',      group: 'Finance'  },
  { key: 'manage:payouts',   label: 'Manage Payouts',    group: 'Finance'  },
  { key: 'approve:payouts',  label: 'Approve Payouts',   group: 'Finance'  },
  { key: 'manage:commission',label: 'Commission Rules',  group: 'Finance'  },
  // Disputes
  { key: 'view:disputes',   label: 'View Disputes',      group: 'Support'  },
  { key: 'manage:disputes', label: 'Resolve Disputes',   group: 'Support'  },
  { key: 'view:sos',        label: 'View SOS',           group: 'Support'  },
  { key: 'resolve:sos',     label: 'Resolve SOS',        group: 'Support'  },
  // Staff
  { key: 'view:staff',      label: 'View Staff',         group: 'Admin'    },
  { key: 'manage:staff',    label: 'Manage Staff',       group: 'Admin'    },
  { key: 'invite:staff',    label: 'Invite Staff',       group: 'Admin'    },
  // Geography
  { key: 'view:geography',  label: 'View Cities/Areas',  group: 'System'   },
  { key: 'manage:geography',label: 'Manage Cities/Areas',group: 'System'   },
  { key: 'manage:services', label: 'Manage Services',    group: 'System'   },
  { key: 'manage:pricing',  label: 'Manage Pricing',     group: 'System'   },
  { key: 'manage:surge',    label: 'Surge Pricing',      group: 'System'   },
  // Marketing
  { key: 'view:campaigns',    label: 'View Campaigns',   group: 'Marketing'},
  { key: 'manage:campaigns',  label: 'Manage Campaigns', group: 'Marketing'},
  { key: 'approve:campaigns', label: 'Approve Campaigns',group: 'Marketing'},
  { key: 'view:coupons',      label: 'View Coupons',     group: 'Marketing'},
  { key: 'manage:coupons',    label: 'Manage Coupons',   group: 'Marketing'},
  { key: 'manage:banners',    label: 'Manage Banners',   group: 'Marketing'},
  // Analytics
  { key: 'view:analytics',   label: 'View Analytics',    group: 'Analytics'},
  { key: 'view:audit_logs',  label: 'View Audit Logs',   group: 'Analytics'},
  { key: 'view:all_logs',    label: 'View All Logs',     group: 'Analytics'},
  // Uniform
  { key: 'view:uniform_checks',   label: 'View Uniform Checks',  group: 'Operations'},
  { key: 'review:uniform_checks', label: 'Review Uniform Checks',group: 'Operations'},
  // System
  { key: 'manage:feature_flags',label: 'Feature Flags',  group: 'System'   },
  { key: 'manage:app_versions', label: 'App Versions',   group: 'System'   },
  { key: 'revoke:sessions',     label: 'Revoke Sessions',group: 'Security' },
  { key: 'manage:system',       label: 'System Settings',group: 'Security' },
];
