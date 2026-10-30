// space-distance -- component spec, in Emerge.
// NEW component, not a port. Built for a genuinely long-distance
// relationship (US <-> India) -- Eravos's own computeRelationalHealth()
// checked directly and found to have zero concept of distance.

version 0.1.0
domain "record"

component SpaceDistance {
  root       : Record
  implements : [contact_logging, cadence_baseline, timezone_overlap]

  found_gap_in: "eravos/shared/eravos-kernel.js computeRelationalHealth() -- checked directly, real code, counts ruptures/missed-commitments/unread-needs, nothing about distance or contact rhythm at all"

  gate space_log_contact {
    mechanism : "real WARP Gate, hard Axiom on contact type (message|call|video|in-person)"
    result    : "{ id, contactType, timestamp }"
    emits     : [space:contact-logged]
  }

  cadence_baseline {
    mechanism : "real mean + stddev of gaps between logged contacts, learned from THIS couple's own history, not assumed from a generic rule"
    honesty   : "hasBaseline: false below 5 real logged contacts -- never a fabricated baseline from insufficient data"
  }

  timezone_overlap {
    mechanism : "real Intl.DateTimeFormat API, same one eravos-kernel.js already uses for timezone_created_in -- computed at a specific real date so DST is correctly handled on whichever side observes it (India: none; most US zones: yes)"
    verified  : "Asia/Kolkata fixed +330min year-round; America/New_York genuinely -240 summer / -300 winter; overlap for that exact pair genuinely 5.5h summer / 4.5h winter -- independently sanity-checked by hand, not just asserted by the test"
  }

  status: implemented
  verified_by: "12 tests including two real bug-regression tests: computeAwakeOverlapHours found asymmetric (5.5h vs 15h depending on argument order -- 15h also violated the real geometric upper bound since neither person is awake >15h/day) and fixed with correct circular-interval logic; a zero-variance history found silently defaulting to 'normal' regardless of real deviation size, fixed with an epsilon floor"

  hooked_into: "eravos/shared/eravos-kernel.js's real computeRelationalHealth(), via a cached background-refreshed fetch to Emergence's own POST /space/health -- verified end-to-end against a real live Emergence server, not just designed"
}
