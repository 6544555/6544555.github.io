export function HeartbeatDivider() {
  return (
    <div className="heartbeat-divider" aria-hidden="true">
      <div className="heartbeat-meta">
        <span>Vital trace</span>
        <span>Continues</span>
      </div>
      <svg
        className="heartbeat-trace"
        viewBox="0 0 1200 96"
        preserveAspectRatio="none"
        focusable="false"
      >
        <path
          className="heartbeat-base"
          pathLength="1"
          d="M0 58H120L132 54L145 58H158L170 20L184 84L198 42L210 58H332L346 52L358 58H372L384 26L398 78L412 44L424 58H560L574 54L588 58H600L612 14L628 88L642 38L654 58H790L804 52L816 58H830L842 22L856 80L870 42L882 58H1020L1034 54L1046 58H1070L1082 28L1096 74L1110 44L1122 58H1200"
        />
        <path
          className="heartbeat-pulse"
          pathLength="1"
          d="M0 58H120L132 54L145 58H158L170 20L184 84L198 42L210 58H332L346 52L358 58H372L384 26L398 78L412 44L424 58H560L574 54L588 58H600L612 14L628 88L642 38L654 58H790L804 52L816 58H830L842 22L856 80L870 42L882 58H1020L1034 54L1046 58H1070L1082 28L1096 74L1110 44L1122 58H1200"
        />
      </svg>
    </div>
  )
}
