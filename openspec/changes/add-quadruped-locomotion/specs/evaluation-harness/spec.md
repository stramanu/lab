# Spec Delta

## Purpose

Extends the evaluation harness with parallel evaluation across worker threads.

## ADDED Requirements

### Requirement: Parallel evaluation
The evaluation runner SHALL optionally split the seeds of a condition among worker threads. Each worker SHALL build its own environments after awaiting the game's initialisation, and return per-seed records. The records SHALL be merged in seed order, so that every reported number equals the sequential evaluation's, wall-clock timings excepted. The study SHALL record the worker count.

#### Scenario: Same numbers as sequential
- **WHEN** a condition is evaluated on the same seeds sequentially and with 4 workers
- **THEN** the scores, costs, escalation shares and agreements are identical
