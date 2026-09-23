# Spec Delta

## ADDED Requirements

### Requirement: Activation trace
The network SHALL be able to return, for an input, the activations of every layer of its forward pass (input, both hidden layers after ReLU, and output logits), consistent with the probabilities it returns for the same input.

#### Scenario: Trace matches the policy
- **WHEN** the trace and the masked policy are computed for the same input
- **THEN** the softmax of the traced logits equals the policy probabilities within 1e-6
