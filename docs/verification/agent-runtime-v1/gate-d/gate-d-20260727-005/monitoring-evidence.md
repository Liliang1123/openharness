# Gate D Monitoring Evidence

Prepared on 2026-07-27 for `gate-d-20260727-005`.

- `/bin/ps` is available for Runtime child RSS sampling.
- `/usr/sbin/lsof` is available for Runtime child file-descriptor and listener sampling.
- `/usr/bin/pgrep` is available for MCP child-count sampling.
- Active preflight must recheck both the 2 GiB minimum and 10% free-filesystem watermark immediately before the run.
- Java Gateway is operator-managed independently and is never restarted by the Gate D supervisor.
- Worker readiness, queue saturation and main-thread responsiveness remain fail-closed runtime signals.
- Monitoring observations are appended to the mode-0600 fsynced JSONL journal; a hard failure stops the run without automatic retry.
