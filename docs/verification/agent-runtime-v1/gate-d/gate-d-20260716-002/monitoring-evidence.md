# Gate D Monitoring Evidence

Observed at 2026-07-16 09:33 CST on the execution host.

- `/bin/ps`: available; used for Runtime child RSS sampling.
- `/usr/sbin/lsof`: available; used for Runtime child file-descriptor sampling.
- `/usr/bin/pgrep`: available; used for MCP child-count sampling.
- Free filesystem space exceeds both the 2 GiB minimum and the 10% watermark.
- Java Gateway is operator-managed independently from the Runtime child and is never restarted by the Gate D supervisor.
- Monitoring observations are appended to the mode-0600 fsynced JSONL journal; hard failures stop the run.
