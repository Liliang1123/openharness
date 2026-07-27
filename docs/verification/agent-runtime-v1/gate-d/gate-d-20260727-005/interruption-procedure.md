# Gate D Interruption Procedure

1. Send SIGINT or SIGTERM only to the Gate D supervisor when operator interruption is required.
2. The supervisor records `OPERATOR_INTERRUPTION`, stops new admission and workload workers, terminates only the TypeScript Runtime child, and retains the append-only journal.
3. The next bounded checkpoint writes exactly one no-overwrite schema-valid FAIL partial report.
4. Do not delete, overwrite, rename as PASS, or automatically retry any journal, partial report, preflight, database or final report.
5. Java Gateway remains independently managed and is not restarted by the supervisor.
6. Worker failure never triggers in-process Worker replacement; recovery requires a new Runtime process and normal lock/bootstrap/reconciliation.
7. No interruption or process exit authorizes promotion, archive or publication.
