# Capability: <stable-id>

- Status: draft
- Version: <version>
- User outcome: <observable outcome>
- Owner: <responsible agent or team>
- Last updated: <date>

## Domain boundary

### In scope
- <behavior included in this capability>

### Out of scope
- <nearby behavior deliberately excluded>

## Domain vocabulary

- <term>: <meaning in this capability>

## Scenarios

### S1: <name>

**Given** <starting domain conditions>
**When** <domain operation>
**Then** <observable result and retained information>

### S2: <name>

**Given** <starting domain conditions>
**When** <domain operation>
**Then** <observable result and retained information>

## Inputs

- <input>: <type, validation, and meaning>

## Outputs

- <output>: <type and guaranteed meaning>

## States

| State | Meaning | Allowed transitions |
|---|---|---|
| <state> | <domain or operation state> | <next states> |

## Errors and recovery

| Error | Condition | Result/recovery | Partial application allowed? |
|---|---|---|---|
| <error> | <condition> | <safe recovery> | <yes/no and why> |

## Invariants

- <rule that must remain true before and after every operation>

## Scale and performance envelope

- <expected data volume, concurrency, latency, or other relevant boundary>

## Observability

- <domain event, audit record, metric, or diagnostic field needed to verify behavior>

## Headless interface

```text
<domain command or query>(<input>) -> <output or domain error>
```

## Contract tests

- <test mapped to S1 or another scenario>
- <test for each important state and error>
- <test for every invariant and no-partial-application rule>

## Change history

- <version/date>: <authorized change or initial draft>

