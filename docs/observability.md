# Observability

## Order Logs

Page: `/orders`

Use for:

- order lifecycle (`queued`, `running`, `completed`, `failed`, `cancelled`)
- request/result payload inspection
- per-order event logs

## LLM Failures

Page: `/llm/failures`

Use for:

- provider/model-level failures
- request/response error details
- trigger/component filtering

## Generation Performance

Page: `/generation-performance`

Use for:

- per-article generation timing runs
- run kind split: `preview` vs `content`
- duration and LLM duration
- attempts and status trends

Important:

- Timing here is worker execution time.
- Queue wait time before worker claim is not included.
