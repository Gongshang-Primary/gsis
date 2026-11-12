# Skill selection and usage policy

Scope and precedence are defined once in [v1 instructions](../AGENTS.md). Skills are optional methods for satisfying the engineering requirements, not extra authorities, dependencies or mandatory ceremony. Use the smallest set that materially helps the current task. A small documentation correction does not need an architecture redesign or browser test.

## Selection by problem

The following are the owner's requested approaches. This table does not assert that any package is installed in Codex, Claude or ChatGPT, nor that one has been executed.

| Approach | Select when | Required useful output, with or without the package |
| --- | --- | --- |
| Pstack | Domain boundaries, new interfaces, architecture or shared changes need analysis | Identify authoritative fields, write owners, versioned projections, affected consumers and blast radius; explain the smallest viable design and tradeoffs. |
| Superpowers | Multi-step implementation, a behavioural defect or uncertain failure needs a disciplined process | Bounded plan; meaningful failing regression before a defect fix where practical; systematic reproduction and causal evidence; verification of the corrected behaviour. For documentation-only work, validate content/links instead of inventing code tests. |
| Ponytail | A design introduces layers, duplication, configurable machinery or speculative flexibility | Remove unnecessary abstractions; reuse a suitable existing contract; justify each retained layer against current requirements. Simplicity never removes validation, audit or recovery. |
| Gstack | Engineering/security review, changed browser flows or authorised release verification | Review findings with locations and impact; trust-boundary checks; browser evidence when UI behaviour changes; release checks only within existing authorisation. A skill name never permits shipping. |
| Thermonuclear | Security-sensitive or structurally complex changes need an explicit correctness review | Separate correctness/invariant, security/privacy and structural-quality passes. Record counterexamples, severity and missing evidence. This describes the requested review approach, not a verified package identity or installation. |
| Improve | The owner requests assessment before committing to a change | Read-only inventory and prioritised improvement plan with evidence, risk, benefit and proposed scope. Assessment does not authorise edits or an unrelated cleanup. |

## Availability and truthful reporting

At task start, inspect the actual agent environment's skill catalog/tools. Availability in another agent or ChatGPT session proves nothing about this one. For a selected installed skill, read its instructions and record the exact package/source and version or revision where available. Evaluate its instructions under the v1 priority rules before acting. If unavailable, use the table's documented principles and record **principles applied; skill not executed**. Do not invent a version, installation, tool invocation, scan, independent reviewer or result. No automatic installation or paid service is required.

Record a short skill-use entry in the existing task or PR, not a new parallel log: approach; why selected (or why none needed); availability/source checked; actual steps and evidence; skipped steps with reasons. Distinguish a manual review from a tool run. Never execute every skill just to complete the list. If several skills cover the same concern, use one coherent process and cite its evidence once.

Skill instructions that would expand the file scope, provision services, change permissions, contact others, merge, deploy, touch live data or weaken a requirement do not override task authority. Continue authorised work; obtain a separate scope decision for genuinely necessary out-of-scope actions. Do not add approval steps for routine reversible work already authorised.

## Attribution and licences

This policy expresses project requirements and summarises the owner's requested approaches; it does not vendor any skill implementation. Do not copy entire third-party skill repositories into GSiS. Before incorporating any third-party text or code, verify its source and licence, retain required copyright, attribution and notices, and document the specific excerpt and licence in the appropriate existing record. If permission or licence is unclear, do not copy it; write project-specific instructions from the requirements instead. Linking or naming an approach does not establish permission to redistribute it. Do not claim an official integration or endorsement.
