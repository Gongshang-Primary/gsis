# GSiS v0.6.00 performance notes

This release keeps the v0.5.09 surgical Exclusions path, shared confirmed calculation/document cache, receipt-based retries and delta save responses. Exclusion-only saves still avoid relief reads/calculation; their retained baseline must have the current model identity. Relief cache and snapshot identities are changed so old model results cannot be mistaken for current results.

The specialist indicator adds a pass over the already loaded assignment ledger per specialist subject. It adds no backend reads. Partial-name filtering operates on rendered options without backend requests. Selection rerenders preserve picker state. KaTeX is already bundled locally; rendering requires no external service.

No new production latency claim is made. See VALIDATION.md for functional checks and limits. Existing service-work comparisons in PERFORMANCE_v0.5.09.md describe the retained Exclusions implementation.
