# Decisions

Design choices and the reasons behind them, for anyone reading the code.

1. **One store, regular prices.** Prices differ by store and promotions come and go. Comparing the
   regular price at one location isolates the package change itself.

2. **Snapshots only on change.** A row per product per day would be 1,242 mostly identical rows a
   day. Storing state changes with `first_seen_at` and `last_seen_at` keeps the same evidence
   (the last day the old state was seen, the first day the new one appeared) at a fraction of the
   size. The cost is that `observations` and `last_seen_at` are updated in place.

3. **Rules first, model second.** About 84% of labels are simple ("16.4 oz") and parse
   deterministically with exact unit factors. The model only reads what the rules cannot, and it
   only transcribes. Unit conversion and multiplication happen in code, so a number can never be
   invented by the model.

4. **Multipack scope.** The catalog writes "6 ct / 18 oz" both for six items of 18 oz each and for
   six items weighing 18 oz together, inconsistently even within one category. The model returns
   the label as written plus its estimate of a single item's amount. Code picks the reading whose
   implied item size is closest to that estimate and lowers confidence when both readings are
   plausible. A count next to a pack count ("4 pk / 120 ct") is always per pack.

5. **Two models.** `deepseek-v4-flash` for plain transcription and `deepseek-v4-pro` for ambiguous
   multipacks, which need product knowledge. Both are open weight (MIT). Measured cost for the
   1,242 product basket, including one full reparse, was about $0.08.

6. **Conservative publishing.** A change is published only when both readings are comparable,
   both parses have confidence of at least 0.7, and the size moved by more than 0.5% and not more
   than 80%. Everything else is held for review or hidden (relabels such as 16 oz to 1 lb), so a
   parse error never appears in the public feed as a shrink.

7. **Read only, grounded agent.** Tools query the same database as the site, arguments are
   validated with Pydantic, tool output is passed to the model as data, and the first round
   forces a tool call so the model cannot answer from memory. A per-visitor daily budget, per-IP
   limits, and a global daily spend cap bound the cost of abuse.

8. **Own rate limiter.** slowapi's middleware could not resolve routes under FastAPI 0.141 and
   silently applied no default limit. A small fixed-window ASGI middleware with tests replaced it.
   In-process state is enough for a single replica.

9. **Tracing everywhere.** OpenTelemetry spans wrap every request, pipeline run, Kroger call, and
   model call. Model calls are also written to `llm_calls` with tokens, cache hits, cost, and
   trace ids, so spend can be audited without the tracing backend.

10. **Kroger acceptable use.** The pipeline makes about 25 product requests a day for a fixed
    basket, stores only state changes for its own comparison, shows names, sizes, and prices as
    returned, never compares against other retailers, and stores no customer data.

11. **Visitor identity behind proxies.** X-Forwarded-For is only read when TRUST_PROXY_HOPS says
    how many proxies of ours stand in front of the app (1 on Container Apps), and only the entry
    appended by a trusted hop is used. Anything the client sent itself is ignored, so spoofed
    headers cannot mint fresh rate-limit or question-budget identities. The question budget is
    consumed with a single atomic upsert committed before the model runs, and outcomes are logged
    in their own transaction so failed requests still leave an audit row.
